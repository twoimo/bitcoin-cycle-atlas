"""Reproduce the local regression lanes without changing product sources."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("lane", choices=("core", "contracts"))
parser.add_argument("--node", required=True)
args = parser.parse_args()
out = Path(__file__).resolve().parent
root = out.parents[2]
node = str(Path(args.node).resolve())
env = {**os.environ, "PATH": str(Path(node).parent) + os.pathsep + os.environ["PATH"]}
lanes = {
    "core": [
        ("full-model-tests", [node, "scripts/test.mjs", "--test-concurrency=2"]),
        ("numerics", ["npm", "run", "verify:numerics"]),
    ],
    "contracts": [
        ("formal-equity", [node, "scripts/verify-equity-state.mjs", str(out / "formal-equity.json")]),
        ("formal-eth", [node, "scripts/verify-eth-state.mjs", str(out / "formal-eth.json")]),
        ("formal-publication", [node, "scripts/verify-publication-state.mjs", str(out / "formal-publication.json")]),
        ("formal-replay", [node, "verification/replay-state/verify.mjs", str(out / "formal-replay.json")]),
        ("forecast", [node, "scripts/build-forecast-ledger.mjs", "--check"]),
        ("research", ["npm", "run", "verify:research"]),
        ("eth-events", [node, "scripts/build-ethereum-events.mjs", "--check"]),
        ("treasury-paths", [node, "scripts/verify-treasury-paths.mjs"]),
        ("cycle", [node, "scripts/refresh-cycle-calibration.mjs", "--check"]),
        ("performance", [node, "scripts/verify-chart-performance.mjs", "--output", str(out / "performance.json")]),
        ("static", [node, "scripts/verify-static.mjs"]),
    ],
}
utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt = {
    "schemaVersion": 1,
    "lane": args.lane,
    "startedAt": utc(),
    "sourceCommitAtStart": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "runtime": subprocess.check_output([node, "--version"], text=True).strip(),
    "steps": [],
    "complete": False,
}
receipt_path = out / (args.lane + "-execution.json")
for name, command in lanes[args.lane]:
    log = out / (name + ".log")
    if log.exists():
        raise RuntimeError("Refusing to overwrite an existing receipt: " + str(log))
    step = {"name": name, "command": command, "startedAt": utc(), "log": log.name}
    start = time.monotonic()
    with log.open("wb") as stream:
        result = subprocess.run(command, cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
    step.update({"exitCode": result.returncode, "elapsedSeconds": round(time.monotonic()-start, 3), "finishedAt": utc(), "logSha256": hashlib.sha256(log.read_bytes()).hexdigest()})
    receipt["steps"].append(step)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"lane": args.lane, **step}), flush=True)
receipt.update({"complete": True, "finishedAt": utc(), "status": "PASS" if all(step["exitCode"] == 0 for step in receipt["steps"]) else "FAIL"})
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
raise SystemExit(0 if receipt["status"] == "PASS" else 1)
