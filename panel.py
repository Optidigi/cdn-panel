"""CDN Panel — lightweight upload GUI served at /panel/."""

import os
import re
import shutil
import time
from datetime import timedelta
from functools import wraps
from pathlib import Path
from threading import Lock

import bcrypt
from flask import (
    Blueprint, render_template, request, redirect, url_for,
    session, flash, jsonify,
)
from PIL import Image, ImageOps
from werkzeug.utils import secure_filename

from variants import generate_variants, SIZES, FULL_QUALITY

panel_bp = Blueprint(
    "panel", __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="static",
    url_prefix="/panel",
)

CDN_ROOT = Path(os.environ.get("CDN_ROOT", "/data/cdn")).resolve()
PANEL_USERNAME = os.environ.get("PANEL_USERNAME", "admin")
PANEL_PASSWORD_HASH = os.environ.get("PANEL_PASSWORD_HASH", "")
PANEL_SECRET_KEY = os.environ.get("PANEL_SECRET_KEY", "change-me-in-production")
SESSION_TIMEOUT = int(os.environ.get("PANEL_SESSION_TIMEOUT", "86400"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "20"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_MB * 1024 * 1024
CDN_BASE_URL = os.environ.get("CDN_BASE_URL", "").rstrip("/")

# How many images to render server-side on first page load
IMAGES_DISPLAY_LIMIT = 50

# Login rate limiting
LOGIN_MAX_ATTEMPTS   = 10
LOGIN_LOCKOUT_SECONDS = 900   # 15 minutes
_login_attempts: dict = {}    # ip → {"count": int, "locked_until": float}
_login_lock = Lock()

# Default categories created with every new project
DEFAULT_CATEGORIES = ["images", "fonts", "documents", "videos"]

# Category that triggers image processing
PROCESSED_CATEGORY = "images"

# Auto-detection: extension -> category
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
CATEGORY_MAP = {
    ".woff": "fonts", ".woff2": "fonts", ".ttf": "fonts", ".otf": "fonts", ".eot": "fonts",
    ".pdf": "documents", ".doc": "documents", ".docx": "documents",
    ".xls": "documents", ".xlsx": "documents", ".csv": "documents", ".txt": "documents",
    ".mp4": "videos", ".webm": "videos", ".mov": "videos", ".avi": "videos", ".mkv": "videos",
}
# Image extensions also map to images category
for ext in IMAGE_EXTENSIONS:
    CATEGORY_MAP[ext] = "images"

BLOCKED_EXTENSIONS = {".exe", ".bat", ".cmd", ".sh", ".ps1", ".php", ".jsp", ".asp", ".aspx", ".cgi"}

# Reserved names that can't be used as categories
RESERVED_NAMES = {"images", "panel", "health", "backfill-variants"}


@panel_bp.record_once
def on_registered(state):
    state.app.secret_key = PANEL_SECRET_KEY
    state.app.permanent_session_lifetime = timedelta(seconds=SESSION_TIMEOUT)
    state.app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE


def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not session.get("panel_authenticated"):
            return redirect(url_for("panel.login"))
        return f(*args, **kwargs)
    return wrapped


def is_safe_project(name: str) -> bool:
    return bool(name) and "/" not in name and ".." not in name and re.match(r"^[a-zA-Z0-9_-]+$", name)


def is_safe_category(name: str) -> bool:
    return bool(name) and "/" not in name and ".." not in name and re.match(r"^[a-z0-9_-]+$", name)


def clean_name(stem: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-")
    return s or "file"


def get_project_categories(project_dir: Path) -> list:
    """Get all categories for a project (directories, excluding size variant dirs)."""
    categories = []
    if project_dir.is_dir():
        for d in sorted(project_dir.iterdir()):
            if d.is_dir() and is_safe_category(d.name):
                categories.append(d.name)
    return categories


def detect_category(filename: str) -> str:
    """Auto-detect category from file extension. Returns empty string if unknown."""
    ext = Path(filename).suffix.lower()
    return CATEGORY_MAP.get(ext, "")


# ---------------------------------------------------------------------------
# Login rate limiting helpers
# ---------------------------------------------------------------------------

def _is_login_locked(ip: str) -> bool:
    with _login_lock:
        rec = _login_attempts.get(ip)
        if rec and time.time() < rec.get("locked_until", 0):
            return True
        return False


def _record_failed_login(ip: str) -> bool:
    """Increment failed-attempt counter. Returns True if the IP just got locked."""
    with _login_lock:
        now = time.time()
        rec = _login_attempts.setdefault(ip, {"count": 0, "locked_until": 0.0})
        # If a previous lockout has expired, reset fully
        if rec.get("locked_until", 0) and now >= rec["locked_until"]:
            rec["count"]       = 0
            rec["locked_until"] = 0.0
        rec["count"] += 1
        if rec["count"] >= LOGIN_MAX_ATTEMPTS:
            rec["locked_until"] = now + LOGIN_LOCKOUT_SECONDS
            return True
        return False


def _remaining_attempts(ip: str) -> int:
    with _login_lock:
        rec = _login_attempts.get(ip)
        if not rec:
            return LOGIN_MAX_ATTEMPTS
        return max(0, LOGIN_MAX_ATTEMPTS - rec.get("count", 0))


def _reset_login_attempts(ip: str):
    with _login_lock:
        _login_attempts.pop(ip, None)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@panel_bp.get("/login")
def login():
    if session.get("panel_authenticated"):
        return redirect(url_for("panel.dashboard"))
    return render_template("login.html")


@panel_bp.post("/login")
def login_post():
    ip = request.remote_addr or "unknown"

    if _is_login_locked(ip):
        flash("Too many failed attempts. Please try again in 15 minutes.", "error")
        return redirect(url_for("panel.login"))

    username = (request.form.get("username") or "").strip()
    password = (request.form.get("password") or "").encode()

    if username == PANEL_USERNAME and PANEL_PASSWORD_HASH and bcrypt.checkpw(password, PANEL_PASSWORD_HASH.encode()):
        _reset_login_attempts(ip)
        session.permanent = True
        session["panel_authenticated"] = True
        return redirect(url_for("panel.dashboard"))

    now_locked = _record_failed_login(ip)
    if now_locked:
        flash("Too many failed attempts. Account locked for 15 minutes.", "error")
    else:
        rem = _remaining_attempts(ip)
        flash(f"Invalid credentials — {rem} attempt{'s' if rem != 1 else ''} remaining.", "error")
    return redirect(url_for("panel.login"))


@panel_bp.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("panel.login"))


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@panel_bp.get("/")
@login_required
def dashboard():
    base_public = CDN_ROOT / "public"
    projects = []
    if base_public.is_dir():
        for d in sorted(base_public.iterdir()):
            if d.is_dir():
                categories = get_project_categories(d)
                counts = {}
                for cat in categories:
                    cat_dir = d / cat
                    if cat == PROCESSED_CATEGORY:
                        if cat_dir.is_dir():
                            with os.scandir(cat_dir) as it:
                                counts[cat] = sum(1 for e in it if e.is_file(follow_symlinks=False) and e.name.lower().endswith(".webp"))
                        else:
                            counts[cat] = 0
                    else:
                        if cat_dir.is_dir():
                            with os.scandir(cat_dir) as it:
                                counts[cat] = sum(1 for e in it if e.is_file(follow_symlinks=False))
                        else:
                            counts[cat] = 0
                projects.append({
                    "name": d.name,
                    "categories": categories,
                    "counts": counts,
                    "total": sum(counts.values()),
                })
    return render_template("dashboard.html", projects=projects)


# ---------------------------------------------------------------------------
# Create project
# ---------------------------------------------------------------------------

@panel_bp.post("/projects")
@login_required
def create_project():
    name = (request.form.get("name") or "").strip().lower()
    if not is_safe_project(name):
        flash("Invalid project name. Use only letters, numbers, hyphens, underscores.", "error")
        return redirect(url_for("panel.dashboard"))

    base = CDN_ROOT / "public" / name
    if base.exists():
        flash(f"Project '{name}' already exists.", "error")
        return redirect(url_for("panel.dashboard"))

    for cat in DEFAULT_CATEGORIES:
        (base / cat).mkdir(parents=True, exist_ok=True)

    flash(f"Project '{name}' created.", "success")
    return redirect(url_for("panel.project_detail", project=name))


# ---------------------------------------------------------------------------
# Create custom category
# ---------------------------------------------------------------------------

@panel_bp.post("/projects/<project>/categories")
@login_required
def create_category(project):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400

    base = CDN_ROOT / "public" / project
    if not base.is_dir():
        return jsonify({"ok": False, "error": "project not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip().lower()

    if not is_safe_category(name):
        return jsonify({"ok": False, "error": "invalid category name"}), 400

    cat_dir = base / name
    if cat_dir.exists():
        return jsonify({"ok": False, "error": "category already exists"}), 400

    cat_dir.mkdir(parents=True, exist_ok=True)
    return jsonify({"ok": True, "category": name}), 200


# ---------------------------------------------------------------------------
# Project detail
# ---------------------------------------------------------------------------

@panel_bp.get("/projects/<project>")
@login_required
def project_detail(project):
    if not is_safe_project(project):
        flash("Invalid project name.", "error")
        return redirect(url_for("panel.dashboard"))

    base = CDN_ROOT / "public" / project
    if not base.is_dir():
        flash(f"Project '{project}' not found.", "error")
        return redirect(url_for("panel.dashboard"))

    categories = get_project_categories(base)
    category_files = {}
    category_totals = {}

    for cat in categories:
        cat_dir = base / cat
        if not cat_dir.is_dir():
            continue

        if cat == PROCESSED_CATEGORY:
            with os.scandir(cat_dir) as it:
                webp_names = sorted(
                    e.name for e in it
                    if e.is_file(follow_symlinks=False) and e.name.lower().endswith(".webp")
                )
            category_totals[cat] = len(webp_names)
            files = []
            for name in webp_names[:IMAGES_DISPLAY_LIMIT]:
                sizes_available = ["full"]
                for label in SIZES:
                    if (cat_dir / label / name).is_file():
                        sizes_available.append(label)
                files.append({"name": name, "sizes": sizes_available})
            category_files[cat] = files
        else:
            with os.scandir(cat_dir) as it:
                files = sorted(e.name for e in it if e.is_file(follow_symlinks=False))
            category_files[cat] = files
            category_totals[cat] = len(files)

    missing_defaults = [cat for cat in DEFAULT_CATEGORIES if cat not in categories]

    return render_template(
        "project.html",
        project=project,
        categories=categories,
        category_files=category_files,
        category_totals=category_totals,
        images_display_limit=IMAGES_DISPLAY_LIMIT,
        processed_category=PROCESSED_CATEGORY,
        default_categories=DEFAULT_CATEGORIES,
        category_map={ext: cat for ext, cat in CATEGORY_MAP.items()},
        cdn_base=CDN_BASE_URL,
        max_upload_mb=MAX_UPLOAD_MB,
        missing_defaults=missing_defaults,
    )


# ---------------------------------------------------------------------------
# Upload — unified endpoint with category routing
# ---------------------------------------------------------------------------

@panel_bp.post("/projects/<project>/upload")
@login_required
def upload_files(project):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400

    base = CDN_ROOT / "public" / project
    if not base.is_dir():
        return jsonify({"ok": False, "error": "project not found"}), 404

    category = (request.form.get("category") or "").strip().lower()
    if not category or not is_safe_category(category):
        return jsonify({"ok": False, "error": "invalid category"}), 400

    cat_dir = base / category
    cat_dir.mkdir(parents=True, exist_ok=True)

    files = request.files.getlist("files")
    if not files:
        return jsonify({"ok": False, "error": "no files provided"}), 400

    processed = []
    uploaded = []
    skipped = []
    errors = []

    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()

        if ext in BLOCKED_EXTENSIONS:
            skipped.append(f.filename)
            continue

        if category == PROCESSED_CATEGORY:
            # Image processing pipeline
            if ext not in IMAGE_EXTENSIONS:
                skipped.append(f.filename)
                continue

            stem = clean_name(Path(f.filename).stem)
            out = cat_dir / f"{stem}.webp"

            try:
                with Image.open(f.stream) as im:
                    im = ImageOps.exif_transpose(im).convert("RGB")
                    im.save(out, "WEBP", quality=FULL_QUALITY, method=6)
                    generate_variants(im, stem, cat_dir)
                webp_name = f"{stem}.webp"
                sizes_available = ["full"]
                for label in SIZES:
                    if (cat_dir / label / webp_name).is_file():
                        sizes_available.append(label)
                processed.append({"name": webp_name, "sizes": sizes_available})
            except Exception as e:
                errors.append({"file": f.filename, "error": str(e)})
        else:
            # Static file — save as-is
            safe_name = secure_filename(f.filename)
            if not safe_name:
                continue
            dest = cat_dir / safe_name
            f.save(dest)
            uploaded.append(safe_name)

    return jsonify({
        "ok": True,
        "processed": processed,
        "uploaded": uploaded,
        "skipped": skipped,
        "errors": errors,
    }), 200


# ---------------------------------------------------------------------------
# Auto-detect category for a filename
# ---------------------------------------------------------------------------

@panel_bp.get("/detect-category")
@login_required
def api_detect_category():
    filename = (request.args.get("filename") or "").strip()
    if not filename:
        return jsonify({"category": ""}), 200
    return jsonify({"category": detect_category(filename)}), 200


# ---------------------------------------------------------------------------
# Delete image (all sizes)
# ---------------------------------------------------------------------------

@panel_bp.delete("/projects/<project>/images/<filename>")
@login_required
def delete_image(project, filename):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400
    if not filename or ".." in filename:
        return jsonify({"ok": False, "error": "invalid filename"}), 400

    images_dir = CDN_ROOT / "public" / project / "images"
    deleted = []

    full = images_dir / filename
    if full.is_file():
        full.unlink()
        deleted.append("full")

    for label in SIZES:
        variant = images_dir / label / filename
        if variant.is_file():
            variant.unlink()
            deleted.append(label)

    if not deleted:
        return jsonify({"ok": False, "error": "file not found"}), 404

    return jsonify({"ok": True, "deleted": deleted}), 200


# ---------------------------------------------------------------------------
# Delete category (and all files in it)
# ---------------------------------------------------------------------------

@panel_bp.delete("/projects/<project>/categories/<category>")
@login_required
def delete_category(project, category):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400
    if not is_safe_category(category):
        return jsonify({"ok": False, "error": "invalid category"}), 400
    if category == PROCESSED_CATEGORY:
        return jsonify({"ok": False, "error": "cannot delete the images category"}), 400
    cat_dir = CDN_ROOT / "public" / project / category
    if not cat_dir.is_dir():
        return jsonify({"ok": False, "error": "category not found"}), 404
    file_count = sum(1 for f in cat_dir.rglob("*") if f.is_file())
    shutil.rmtree(cat_dir)
    return jsonify({"ok": True, "deleted_files": file_count}), 200


# ---------------------------------------------------------------------------
# Delete static file (any category except images)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Delete project (entire directory tree)
# ---------------------------------------------------------------------------

@panel_bp.delete("/projects/<project>")
@login_required
def delete_project(project):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400
    base = CDN_ROOT / "public" / project
    if not base.is_dir():
        return jsonify({"ok": False, "error": "project not found"}), 404
    file_count = sum(1 for f in base.rglob("*") if f.is_file())
    shutil.rmtree(base)
    return jsonify({"ok": True, "deleted_files": file_count}), 200


# ---------------------------------------------------------------------------
# Initialize default categories (repair old-structure projects)
# ---------------------------------------------------------------------------

@panel_bp.post("/projects/<project>/init-categories")
@login_required
def init_categories(project):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400
    base = CDN_ROOT / "public" / project
    if not base.is_dir():
        return jsonify({"ok": False, "error": "project not found"}), 404
    created = []
    for cat in DEFAULT_CATEGORIES:
        cat_dir = base / cat
        if not cat_dir.is_dir():
            cat_dir.mkdir(parents=True, exist_ok=True)
            created.append(cat)
    return jsonify({"ok": True, "created": created}), 200


# ---------------------------------------------------------------------------
# Delete static file (any category except images)
# ---------------------------------------------------------------------------

@panel_bp.get("/projects/<project>/images/page")
@login_required
def project_images_page(project):
    """Paginated image list for Load More — returns JSON."""
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400

    images_dir = CDN_ROOT / "public" / project / PROCESSED_CATEGORY
    if not images_dir.is_dir():
        return jsonify({"ok": False, "error": "not found"}), 404

    try:
        offset = max(0, int(request.args.get("offset", 0)))
        limit  = min(500, max(1, int(request.args.get("limit", 200))))
    except ValueError:
        return jsonify({"ok": False, "error": "invalid params"}), 400

    with os.scandir(images_dir) as it:
        all_names = sorted(
            e.name for e in it
            if e.is_file(follow_symlinks=False) and e.name.lower().endswith(".webp")
        )

    total = len(all_names)
    page  = all_names[offset : offset + limit]

    images = []
    for name in page:
        sizes = ["full"]
        for label in SIZES:
            if (images_dir / label / name).is_file():
                sizes.append(label)
        images.append({"name": name, "sizes": sizes})

    return jsonify({
        "ok":      True,
        "images":  images,
        "total":   total,
        "offset":  offset,
        "limit":   limit,
        "has_more": (offset + limit) < total,
    }), 200


@panel_bp.get("/projects/<project>/images/search")
@login_required
def project_images_search(project):
    """Search images by filename substring — returns JSON."""
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400

    images_dir = CDN_ROOT / "public" / project / PROCESSED_CATEGORY
    if not images_dir.is_dir():
        return jsonify({"ok": False, "error": "not found"}), 404

    q     = (request.args.get("q") or "").strip().lower()
    try:
        limit = min(500, max(1, int(request.args.get("limit", 100))))
    except ValueError:
        limit = 100

    with os.scandir(images_dir) as it:
        all_names = sorted(
            e.name for e in it
            if e.is_file(follow_symlinks=False) and e.name.lower().endswith(".webp")
        )

    matched = [n for n in all_names if q in n.lower()] if q else all_names
    total   = len(matched)
    page    = matched[:limit]

    images = []
    for name in page:
        sizes = ["full"]
        for label in SIZES:
            if (images_dir / label / name).is_file():
                sizes.append(label)
        images.append({"name": name, "sizes": sizes})

    return jsonify({"ok": True, "images": images, "total": total, "query": q}), 200


@panel_bp.delete("/projects/<project>/<category>/<filename>")
@login_required
def delete_static(project, category, filename):
    if not is_safe_project(project):
        return jsonify({"ok": False, "error": "invalid project"}), 400
    if not is_safe_category(category):
        return jsonify({"ok": False, "error": "invalid category"}), 400
    if not filename or ".." in filename:
        return jsonify({"ok": False, "error": "invalid filename"}), 400

    if category == PROCESSED_CATEGORY:
        # Redirect to image delete which handles variants
        return delete_image(project, filename)

    target = CDN_ROOT / "public" / project / category / filename
    if not target.is_file():
        return jsonify({"ok": False, "error": "file not found"}), 404

    target.unlink()
    return jsonify({"ok": True, "deleted": [filename]}), 200
