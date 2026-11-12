#!/usr/bin/env python3
"""Deterministic PDF/WebP worker used only by prepare-conference-media.mjs.

PyMuPDF is deliberate: the earlier conference receipt records missing Korean
glyphs with pdftoppm's Adobe-Korea1 setup. Input PDFs are opened read-only. No
PDF/PPTX rewriting, OCR, metadata copying, or clock-dependent output is used.
"""

import argparse
import json
import os
import platform
import sys
from pathlib import Path

# Set before importing native render/encode dependencies.
for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[name] = "1"

import fitz
import PIL
from PIL import Image, features


def write(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def toolchain():
    if not features.check("webp"):
        raise ValueError("Pillow was built without WebP support")
    return {
        "python": platform.python_version(),
        "platform": sys.platform,
        "architecture": platform.machine(),
        "pymupdf": fitz.VersionBind,
        "mupdf": fitz.VersionFitz,
        "pillow": PIL.__version__,
        "libwebp": features.version("webp"),
    }


def pdf_info(filename):
    with fitz.open(filename) as document:
        if not document.is_pdf or document.needs_pass:
            raise ValueError("Expected an unencrypted PDF")
        return {
            "pages": document.page_count,
            "dimensions": [
                {"width": page.rect.width, "height": page.rect.height}
                for page in document
            ],
        }


def inspect_image(filename):
    with Image.open(filename) as image:
        image.load()
        if image.format != "WEBP":
            raise ValueError("Expected a WebP image")
        return {
            "format": image.format,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "frames": getattr(image, "n_frames", 1),
            "hasMetadata": any(image.info.get(key) for key in ("exif", "icc_profile", "xmp")),
        }


def render_pdf(filename, output, expected_pages, long_edge, quality):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    result = []
    with fitz.open(filename) as document:
        if not document.is_pdf or document.needs_pass:
            raise ValueError("Expected an unencrypted PDF")
        if document.page_count != expected_pages:
            raise ValueError("PDF page count differs from locked input")
        for number, page in enumerate(document, 1):
            size = page.rect
            if size.width <= 0 or size.height <= 0:
                raise ValueError("PDF page has invalid dimensions")
            scale = long_edge / max(size.width, size.height)
            width = max(1, round(size.width * scale))
            height = max(1, round(size.height * scale))
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False, annots=True)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            # MuPDF rounds its raster rectangle outwards. Normalize the final
            # longest edge exactly, including fractional/rotated PDF boxes.
            if image.size != (width, height):
                image = image.resize((width, height), Image.Resampling.LANCZOS)
            target = output / f"{number:04d}.webp"
            if target.exists():
                raise ValueError(f"Refusing to replace existing image: {target}")
            image.save(target, format="WEBP", quality=quality, method=6,
                       lossless=False, exact=True, exif=b"", icc_profile=b"", xmp=b"")
            result.append({"page": number, **inspect_image(target)})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("toolchain")
    info = commands.add_parser("pdf-info")
    info.add_argument("file")
    inspect = commands.add_parser("inspect-image")
    inspect.add_argument("files", nargs="+")
    render = commands.add_parser("render-pdf")
    render.add_argument("file")
    render.add_argument("output")
    render.add_argument("--pages", type=int, required=True)
    render.add_argument("--long-edge", type=int, default=1800)
    render.add_argument("--quality", type=int, default=80)
    args = parser.parse_args()
    if args.command == "toolchain":
        write(toolchain())
    elif args.command == "pdf-info":
        write(pdf_info(args.file))
    elif args.command == "inspect-image":
        write([inspect_image(filename) for filename in args.files])
    elif args.command == "render-pdf":
        if args.pages < 1 or args.long_edge != 1800 or args.quality != 80:
            raise ValueError("The media contract fixes positive pages, long edge 1800, and quality 80")
        write(render_pdf(args.file, args.output, args.pages, args.long_edge, args.quality))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"conference-media: {error}", file=sys.stderr)
        sys.exit(1)
