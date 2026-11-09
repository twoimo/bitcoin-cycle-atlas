#!/usr/bin/env python3
"""Prepare verified conference media; never chooses the pending §7 options.

python3 scripts/conference/prepare-media.py --config <approved.json> --out <new-dir> --check
python3 scripts/conference/prepare-media.py --config <approved.json> --out <new-dir>

Requires Python 3.10+, Pillow with WebP, Poppler, FFmpeg/FFprobe, and Linux renameat2
for atomic no-replace publication. --check performs input/plan checks only.
The example intentionally fails until real inputs and explicit decisions exist.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

EVENT_ID = "plspo-2026-10-31"
EVENT_START = 12 * 3600 + 33 * 60
EVENT_DURATION = 20400
SOURCE_SPEC = {"plaud-1": (0, 18000), "plaud-2": (18000, 2400)}
# Cloudflare Workers Static Assets, checked by the parent task on 2026-11-10:
# https://developers.cloudflare.com/workers/platform/limits/
ASSET_LIMIT_BYTES = 25 * 1024 * 1024
FREE_ASSET_LIMIT = 20000
DURATION_TOLERANCE = 0.05  # Service verification tolerance, not a provider limit.
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class MediaError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise MediaError(message)


def number(value, label, minimum=0, maximum=None):
    require(type(value) in (int, float) and math.isfinite(value), f"{label}: finite number required")
    require(value >= minimum and (maximum is None or value <= maximum), f"{label}: out of range")
    require(abs(value * 1000 - round(value * 1000)) < 0.00001, f"{label}: at most millisecond precision")
    return value


def integer(value, label, minimum, maximum):
    require(type(value) is int and minimum <= value <= maximum, f"{label}: integer {minimum}..{maximum} required")
    return value


def full_sha(value, label):
    require(isinstance(value, str) and SHA256.fullmatch(value), f"{label}: full lowercase SHA-256 required; a 16-character prefix is insufficient")
    return value


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def no_symlinks(path):
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        require(not part.is_symlink(), f"symlink path is not permitted: {part}")
    return path


def source_file(root, entry, label):
    require(isinstance(entry, dict), f"{label}: input object required")
    raw = entry.get("path")
    require(isinstance(raw, str) and raw.strip(), f"{label}.path: real source file required")
    require("\x00" not in raw and ".." not in Path(raw).parts, f"{label}.path: traversal is not permitted")
    path = no_symlinks(Path(raw) if Path(raw).is_absolute() else root / raw)
    require(path.is_relative_to(root), f"{label}: source must stay within inputRoot")
    require(path.exists() and stat.S_ISREG(path.stat().st_mode), f"{label}: regular source file missing")
    require(path.stat().st_size > 0, f"{label}: empty source file")
    expected = full_sha(entry.get("sha256"), f"{label}.sha256")
    require(sha256_file(path) == expected, f"{label}: SHA-256 mismatch")
    return path


def validate_sessions(sessions):
    require(isinstance(sessions, list) and len(sessions) == 15, "session split requires all reviewed program entries 00..14")
    previous = 0
    for index, session in enumerate(sessions):
        require(isinstance(session, dict), "session entry must be an object")
        require(session.get("id") == f"{index:02d}", "sessions must appear exactly in program order 00..14")
        require(isinstance(session.get("title"), str) and session["title"].strip(), "session title is required; do not infer it")
        t0 = number(session.get("t0"), "session.t0", maximum=EVENT_DURATION)
        t1 = number(session.get("t1"), "session.t1", maximum=EVENT_DURATION)
        require(t0 == previous and t1 > t0, "session coverage must be ordered, contiguous, nonoverlapping and nonempty")
        previous = t1
    require(previous == EVENT_DURATION, "sessions must cover the full 0..20400-second event")
    return sessions


def validate_config(config):
    require(isinstance(config, dict) and type(config.get("schemaVersion")) is int and config["schemaVersion"] == 1, "schemaVersion must be 1")
    require(config.get("eventId") == EVENT_ID, "unexpected eventId")
    require(config.get("inputsConfirmed") is True, "inputsConfirmed must explicitly confirm real conference inputs")
    require(isinstance(config.get("inputRoot"), str) and config["inputRoot"].strip(), "inputRoot is required")
    for key in ("finalPdf", "r17Pdf"):
        require(isinstance(config.get(key), dict), f"{key} is required")
        full_sha(config[key].get("sha256"), f"{key}.sha256")
    r17 = config["r17Pdf"]
    require(r17.get("variant") in ("original", "clean"), "R17 variant is undecided: explicitly choose original or clean")
    require(full_sha(r17.get("approvedSha256"), "r17Pdf.approvedSha256") == r17["sha256"], "R17 approval must pin the selected full hash")
    audio = config.get("audio")
    require(isinstance(audio, dict), "audio configuration is required")
    require(audio.get("format") in ("m4a", "opus"), "audio format is undecided: explicitly choose m4a or opus")
    require(audio.get("split") in ("session", "chunk"), "audio split is undecided: explicitly choose session or chunk")
    integer(audio.get("bitrateKbps"), "audio.bitrateKbps", 32, 48)
    if audio["split"] == "session":
        validate_sessions(audio.get("sessions"))
        require(audio.get("chunkSeconds") is None, "session split cannot also specify chunkSeconds")
    else:
        integer(audio.get("chunkSeconds"), "audio.chunkSeconds", 1, EVENT_DURATION)
        require(audio.get("sessions") is None, "chunk split does not infer program sessions; provide them separately to timeline")
    render = config.get("render")
    require(isinstance(render, dict), "render configuration is required")
    integer(render.get("longEdge"), "render.longEdge", 1600, 2000)
    integer(render.get("quality"), "render.quality", 75, 85)
    integer(config.get("existingAssetCount"), "existingAssetCount", 0, FREE_ASSET_LIMIT)
    sources = config.get("audioSources")
    require(isinstance(sources, list) and len(sources) == 2, "exactly two audio sources are required")
    require([item.get("id") for item in sources if isinstance(item, dict)] == list(SOURCE_SPEC), "audio sources must be plaud-1 then plaud-2")
    for source in sources:
        expected_t0, expected_duration = SOURCE_SPEC[source["id"]]
        require(source.get("t0") == expected_t0 and source.get("durationSec") == expected_duration, "audio source timing must be 0/18000 and 18000/2400; no inferred offsets")
        full_sha(source.get("sha256"), f"{source['id']}.sha256")
    return config


def plan_audio(config):
    audio = config["audio"]
    if audio["split"] == "session":
        intervals = validate_sessions(audio["sessions"])
    else:
        width = integer(audio.get("chunkSeconds"), "audio.chunkSeconds", 1, EVENT_DURATION)
        intervals = [{"id": f"{index:04d}", "t0": start, "t1": min(start + width, EVENT_DURATION)}
                     for index, start in enumerate(range(0, EVENT_DURATION, width), 1)]
    result = []
    for interval in intervals:
        for source_id, (source_start, source_duration) in SOURCE_SPEC.items():
            start = max(interval["t0"], source_start)
            end = min(interval["t1"], source_start + source_duration)
            if end <= start:
                continue
            item_id = f"{audio['split']}-{interval['id']}-{source_id}"
            result.append({"id": item_id, "file": f"audio/{item_id}.{audio['format']}",
                           "t0": start, "t1": end, "sourceId": source_id,
                           "sourceOffsetSec": start - source_start,
                           "plannedDurationSec": round(end - start, 3),
                           "clockStart": clock_string(start)})
            if audio["split"] == "session":
                result[-1]["sessionId"] = interval["id"]
    require(result and result[0]["t0"] == 0 and result[-1]["t1"] == EVENT_DURATION, "incomplete audio plan")
    require(all(left["t1"] == right["t0"] for left, right in zip(result, result[1:])), "audio plan has a gap or overlap")
    require(config["existingAssetCount"] + 547 + len(result) + 1 <= FREE_ASSET_LIMIT,
            "existing assets plus media and manifest exceed the 20,000-asset verification ceiling")
    return result


def clock_string(seconds):
    millis = round((EVENT_START + seconds) * 1000)
    whole, fraction = divmod(millis, 1000)
    hour, remainder = divmod(whole, 3600)
    minute, second = divmod(remainder, 60)
    base = f"{hour:02d}:{minute:02d}:{second:02d}"
    return base if fraction == 0 else f"{base}.{fraction:03d}"


def run(command):
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                check=True, env={**os.environ, "LC_ALL": "C"})
    except FileNotFoundError as error:
        raise MediaError(f"required tool unavailable: {command[0]}") from error
    except subprocess.CalledProcessError as error:
        # Source contents are not printed; command/tool diagnostics are bounded.
        raise MediaError(f"{command[0]} failed: {error.stderr.decode('utf-8', errors='replace')[-2000:]}") from error
    return result.stdout.decode("utf-8", errors="strict")


def probe_audio(path):
    data = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                           "stream=codec_name,channels,sample_rate:format=duration", "-of", "json", str(path)]))
    require(len(data.get("streams", [])) == 1, "audio stream is missing")
    try:
        duration = float(data.get("format", {}).get("duration", "nan"))
    except (TypeError, ValueError) as error:
        raise MediaError("invalid audio duration from ffprobe") from error
    require(math.isfinite(duration) and duration > 0, "invalid audio duration from ffprobe")
    return {**data["streams"][0], "durationSec": duration}


def validate_duration(measured, expected, label):
    require(math.isfinite(measured) and abs(measured - expected) <= DURATION_TOLERANCE + 1e-9,
            f"{label}: measured duration {measured} differs from planned {expected} by more than {DURATION_TOLERANCE}s")


def tool_versions():
    import PIL
    versions = {"python": sys.version.split()[0], "pillow": PIL.__version__}
    for executable, option in (("pdfinfo", "-v"), ("pdftoppm", "-v"), ("ffmpeg", "-version"), ("ffprobe", "-version")):
        try:
            result = subprocess.run([executable, option], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, check=True, env={**os.environ, "LC_ALL": "C"})
        except (OSError, subprocess.CalledProcessError) as error:
            raise MediaError(f"unable to record version of {executable}") from error
        lines = (result.stdout + result.stderr).decode("utf-8", errors="replace").splitlines()
        require(bool(lines), f"empty tool version from {executable}")
        versions[executable] = lines[0]
    return versions


def preflight(config, config_dir):
    validate_config(config)
    root_raw = Path(config["inputRoot"])
    root = no_symlinks(root_raw if root_raw.is_absolute() else config_dir / root_raw)
    require(root.is_dir(), "inputRoot directory is missing")
    items = [("final-290", config["finalPdf"]), ("r17-257", config["r17Pdf"])]
    items.extend((source["id"], source) for source in config["audioSources"])
    paths = {key: source_file(root, entry, key) for key, entry in items}
    require(len(set(paths.values())) == 4, "each input must identify its own source file")
    inputs = [{"id": key, "sha256": entry["sha256"], "sizeBytes": paths[key].stat().st_size,
               "originalName": paths[key].name} for key, entry in items]
    for deck_id, pages in (("final-290", 290), ("r17-257", 257)):
        info = run(["pdfinfo", str(paths[deck_id])])
        match = re.search(r"^Pages:\s+(\d+)\s*$", info, re.M)
        require(match is not None and int(match[1]) == pages, f"{deck_id}: expected exactly {pages} PDF pages")
        require(not re.search(r"^Encrypted:\s+yes\b", info, re.M), "encrypted PDF input is not supported")
    for input_item in inputs[2:]:
        actual = probe_audio(paths[input_item["id"]])
        nominal = SOURCE_SPEC[input_item["id"]][1]
        validate_duration(actual["durationSec"], nominal, input_item["id"])
        input_item.update(durationSec=actual["durationSec"], nominalDurationSec=nominal)
    from PIL import features
    require(features.check("webp"), "Pillow WebP support is required")
    for executable in ("pdftoppm", "ffmpeg", "ffprobe"):
        require(shutil.which(executable) is not None, f"required tool unavailable: {executable}")
    return paths, inputs, plan_audio(config)


def validate_output_path(output):
    output = no_symlinks(output)
    require(not output.exists(), "output already exists; refusing to overwrite any prior build")
    require(output.parent.is_dir(), "output parent must already exist")
    require(output.name not in ("", ".", ".."), "invalid output directory")
    return output


def asset_record(path, root):
    require(path.is_file() and not path.is_symlink(), "output asset is not a regular file")
    size = path.stat().st_size
    require(0 < size <= ASSET_LIMIT_BYTES, f"asset exceeds 25 MiB or is empty: {path.relative_to(root)} ({size} bytes)")
    return {"file": path.relative_to(root).as_posix(), "sha256": sha256_file(path), "sizeBytes": size}


def render_deck(source, output, pages, long_edge, quality):
    from PIL import Image
    output.mkdir(parents=True)
    for page in range(1, pages + 1):
        prefix = output / f".{page:04d}"
        run(["pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-scale-to", str(long_edge),
             "-png", str(source), str(prefix)])
        png = prefix.with_suffix(".png")
        destination = output / f"{page:04d}.webp"
        with Image.open(png) as image:
            require(max(image.size) == long_edge, "PDF renderer returned an unexpected image size")
            image.convert("RGB").save(destination, "WEBP", quality=quality, method=6)
        png.unlink()


def transcode_span(source, output, span, format_name, bitrate):
    require(format_name in ("m4a", "opus"), "explicit supported audio format required")
    integer(bitrate, "bitrateKbps", 32, 48)
    require(not output.exists(), "audio output already exists")
    codec = "aac" if format_name == "m4a" else "libopus"
    command = ["ffmpeg", "-v", "error", "-nostdin", "-n", "-ss", str(span["sourceOffsetSec"]), "-i", str(source),
               "-t", str(span["plannedDurationSec"]), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "48000",
               "-c:a", codec, "-b:a", f"{bitrate}k", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact"]
    if format_name == "m4a":
        command += ["-movflags", "+faststart"]
    command.append(str(output))
    run(command)
    probe = probe_audio(output)
    require(probe.get("channels") == 1, "transcoded audio is not mono")
    require(probe.get("codec_name") == ("aac" if format_name == "m4a" else "opus"), "unexpected output codec")
    validate_duration(probe["durationSec"], span["plannedDurationSec"], span["id"])
    return {**span, "durationSec": probe["durationSec"],
            "durationDeviationSec": round(probe["durationSec"] - span["plannedDurationSec"], 6)}


def publish_directory(staging, output):
    """Linux renameat2(RENAME_NOREPLACE): atomic publication, even if a rival creates output."""
    require(sys.platform.startswith("linux"), "atomic no-replace publication currently requires Linux renameat2")
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    require(rename is not None, "renameat2 unavailable; refusing an overwrite-prone fallback")
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(staging), -100, os.fsencode(output), 1) != 0:
        code = ctypes.get_errno()
        if code == errno.EEXIST:
            raise MediaError("output appeared during build; existing directory preserved")
        raise OSError(code, os.strerror(code))


def prepare(config_path, output, check_only=False):
    output = validate_output_path(output)
    config_bytes = config_path.read_bytes()
    config_hash = hashlib.sha256(config_bytes).hexdigest()
    config = json.loads(config_bytes.decode("utf-8"))
    paths, inputs, plan = preflight(config, config_path.parent)
    versions = tool_versions()
    require(all(not path.is_relative_to(output) for path in paths.values()), "output cannot contain an input")
    if check_only:
        return {"status": "preflight-ok", "mediaPrepared": False, "inputs": inputs,
                "plannedPages": 547, "plannedAudioFiles": len(plan), "output": str(output), "toolVersions": versions}
    require(sys.platform.startswith("linux"), "atomic no-replace publication currently requires Linux")
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}-preparing-", dir=output.parent))
    try:
        for deck_id, directory, pages in (("final-290", "final", 290), ("r17-257", "r17", 257)):
            render_deck(paths[deck_id], staging / "pages" / directory, pages, **{
                "long_edge": config["render"]["longEdge"], "quality": config["render"]["quality"]})
        (staging / "audio").mkdir()
        audio = [transcode_span(paths[span["sourceId"]], staging / span["file"], span,
                                config["audio"]["format"], config["audio"]["bitrateKbps"]) for span in plan]
        assets = [asset_record(path, staging) for path in sorted(staging.rglob("*")) if path.is_file()]
        require(len(assets) == 547 + len(audio), "unexpected generated asset count")
        for item in inputs:
            require(sha256_file(paths[item["id"]]) == item["sha256"], "source changed during conversion; refusing publication")
        require(sha256_file(config_path) == config_hash, "config changed during conversion; refusing publication")
        manifest = {
            "schemaVersion": 1, "eventId": EVENT_ID,
            "decks": [
                {"id": "final-290", "label": "최종본 290쪽", "pages": 290, "dir": "pages/final",
                 "sourceSha256": config["finalPdf"]["sha256"], "variant": "final"},
                {"id": "r17-257", "label": "R17 편집형 257쪽", "pages": 257, "dir": "pages/r17",
                 "sourceSha256": config["r17Pdf"]["sha256"], "variant": config["r17Pdf"]["variant"]}],
            "audio": audio, "assets": assets, "inputs": inputs,
            "verification": {"mediaPrepared": True, "realInputsVerified": True,
                "audioFormat": config["audio"]["format"], "audioSplit": config["audio"]["split"],
                "r17Variant": config["r17Pdf"]["variant"], "r17ApprovedSha256": config["r17Pdf"]["approvedSha256"],
                "bitrateKbps": config["audio"]["bitrateKbps"], "channels": 1,
                "durationToleranceSec": DURATION_TOLERANCE, "maxAssetBytes": ASSET_LIMIT_BYTES,
                "existingAssetCount": config["existingAssetCount"], "plannedTotalAssetCount": len(assets) + 1 + config["existingAssetCount"],
                "deploymentPackageVerified": False, "toolVersions": versions,
                "inputConfigSha256": config_hash, "visualReview": "pending", "listeningReview": "pending"}}
        payload = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
        require(len(payload) <= ASSET_LIMIT_BYTES, "media manifest exceeds the asset size limit")
        (staging / "media-manifest.json").write_bytes(payload)
        publish_directory(staging, output)
        return {"status": "prepared", "manifest": str(output / "media-manifest.json"), "pages": 547,
                "audioFiles": len(audio), "assetBytes": sum(item["sizeBytes"] for item in assets),
                "visualReview": "pending", "listeningReview": "pending"}
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="validate real inputs and plan; do not write assets")
    args = parser.parse_args()
    try:
        config_path = no_symlinks(args.config)
        require(config_path.is_file(), "config file missing")
        result = prepare(config_path, args.out, args.check)
        print(json.dumps(result, ensure_ascii=False))
    except (MediaError, OSError, json.JSONDecodeError, ImportError) as error:
        print(json.dumps({"status": "blocked", "mediaPrepared": False, "reason": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
