import os
import re
from pathlib import Path
from flask import Flask, request, jsonify

from variants import SIZES, backfill_variants_for_file

app = Flask(__name__)

CDN_ROOT = Path(os.environ.get("CDN_ROOT", "/data/cdn")).resolve()


def is_safe_project(project: str) -> bool:
    return bool(project) and "/" not in project and ".." not in project


@app.get("/health")
def health():
    return {"ok": True}, 200


@app.post("/backfill-variants")
def backfill_variants():
    """One-time migration tool. Generates sized variants for existing full-size webps."""
    project_filter = (request.args.get("project") or "").strip()
    limit = int(request.args.get("limit") or "10")
    base_public = (CDN_ROOT / "public").resolve()

    if not base_public.is_dir():
        return jsonify({"ok": True, "files": 0, "processed": 0, "remaining": 0}), 200

    projects = []
    if project_filter:
        if is_safe_project(project_filter):
            projects = [project_filter]
    else:
        projects = [d.name for d in sorted(base_public.iterdir()) if d.is_dir()]

    total_files = 0
    total_created = 0
    processed = 0
    remaining = 0
    details = []

    for project in projects:
        images_dir = (base_public / project / "images").resolve()
        if not images_dir.is_dir():
            continue
        for f in sorted(images_dir.iterdir()):
            if not f.is_file() or f.suffix.lower() != ".webp":
                continue
            all_exist = all((images_dir / label / f.name).is_file() for label in SIZES)
            if all_exist:
                continue
            total_files += 1
            if processed >= limit:
                remaining += 1
                continue
            try:
                created = backfill_variants_for_file(f, images_dir)
                if created:
                    total_created += len(created)
                    details.append({"project": project, "file": f.name, "created": list(created.keys())})
                processed += 1
            except Exception as e:
                details.append({"project": project, "file": f.name, "error": str(e)})
                processed += 1

    return jsonify({
        "ok": True,
        "files": total_files,
        "processed": processed,
        "variants_created": total_created,
        "remaining": remaining,
        "details": details,
    }), 200


from panel import panel_bp
app.register_blueprint(panel_bp)
