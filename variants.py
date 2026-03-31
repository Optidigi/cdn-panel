"""Multi-size webp variant generation for the CDN image processor."""

from pathlib import Path
from PIL import Image

SIZES = {
    "1920": {"max_width": 1920, "quality": 82},
    "1024": {"max_width": 1024, "quality": 80},
    "640":  {"max_width": 640,  "quality": 78},
    "320":  {"max_width": 320,  "quality": 75},
}

FULL_QUALITY = 80


def convert_to_webp(img: Image.Image, out_path: Path, quality: int) -> None:
    """Save an image as webp at the given path and quality."""
    img.save(out_path, "WEBP", quality=quality, method=6)


def resize_to_width(img: Image.Image, max_width: int) -> Image.Image:
    """Resize image to max_width preserving aspect ratio. No upscaling."""
    w, h = img.size
    if w <= max_width:
        return img.copy()
    ratio = max_width / w
    new_h = int(h * ratio)
    return img.resize((max_width, new_h), Image.LANCZOS)


def generate_variants(img: Image.Image, clean_stem: str, webp_dir: Path) -> dict:
    """Generate sized variants from a PIL Image.

    Args:
        img: RGB PIL Image (already EXIF-transposed).
        clean_stem: Sanitised filename stem (no extension).
        webp_dir: Path to the project's derived/webp/ directory.

    Returns:
        Dict mapping size label to output path (relative to CDN_ROOT),
        or None for sizes that failed.
    """
    results = {}
    for label, cfg in SIZES.items():
        size_dir = webp_dir / label
        size_dir.mkdir(parents=True, exist_ok=True)
        out = size_dir / f"{clean_stem}.webp"
        resized = resize_to_width(img, cfg["max_width"])
        convert_to_webp(resized, out, cfg["quality"])
        results[label] = str(out)
    return results


def backfill_variants_for_file(webp_path: Path, webp_dir: Path) -> dict:
    """Generate missing sized variants for an existing full-size webp.

    Args:
        webp_path: Path to the existing full-size .webp file.
        webp_dir: Parent derived/webp/ directory.

    Returns:
        Dict of size label -> output path for newly created variants.
    """
    stem = webp_path.stem
    created = {}
    with Image.open(webp_path) as img:
        img = img.convert("RGB")
        for label, cfg in SIZES.items():
            size_dir = webp_dir / label
            target = size_dir / f"{stem}.webp"
            if target.exists():
                continue
            size_dir.mkdir(parents=True, exist_ok=True)
            resized = resize_to_width(img, cfg["max_width"])
            convert_to_webp(resized, target, cfg["quality"])
            created[label] = str(target)
    return created
