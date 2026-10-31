"""Apply the user-approved overlay patch to one exact baseline; remove this helper."""
from pathlib import Path
import base64
import gzip
import hashlib
import json
import os
import subprocess

BASE = 'a9e0989135f0e556a57da962e6c3b19df022c943'
TREE = '23d48c9eef363c3e2652cc423e2f68b8483f7c4e'
PATCH_SHA256 = 'b32914a68e079eb2ab9088a1a2833638c3de1a3ed925d9b1b5c5522f3291dfd3'
BRANCH = 'fix/replay-fixed-overlay-v1.29.7'
HELPERS = '.github/atlas-overlay-apply'
WORKFLOW = '.github/workflows/apply-fixed-overlay-once.yml'


def git(*args: str) -> str:
    return subprocess.check_output(['git', *args], text=True).strip()


def require(ok: bool, message: str) -> None:
    if not ok:
        raise RuntimeError(message)


require(os.environ.get('GITHUB_REPOSITORY') == 'twoimo/bitcoin-cycle-atlas', 'Wrong repository')
require(os.environ.get('GITHUB_REF') == 'refs/heads/' + BRANCH, 'Wrong branch')
require(git('rev-parse', 'HEAD') == os.environ.get('GITHUB_SHA'), 'Wrong checkout')
require(git('show', '-s', '--format=%P', 'HEAD') == BASE, 'Baseline parent changed')
require(not git('status', '--porcelain'), 'Checkout is not clean')
parts = sorted(Path(HELPERS).glob('part-*.b64'))
require([p.name for p in parts] == [f'part-{i}.b64' for i in range(5)], 'Unexpected patch parts')
encoded = ''.join(p.read_text(encoding='ascii') for p in parts)
require(len(encoded) == 29316, 'Patch transport length changed')
patch = gzip.decompress(base64.b64decode(encoded, validate=True))
require(len(patch) == 73012 and hashlib.sha256(patch).hexdigest() == PATCH_SHA256, 'Patch bytes changed')
proof = Path(os.environ['RUNNER_TEMP']) / 'overlay-apply-evidence'
proof.mkdir(parents=True, exist_ok=True)
patch_path = proof / 'delivery.patch'
patch_path.write_bytes(patch)
subprocess.run(['git', 'apply', '--check', '--index', str(patch_path)], check=True)
subprocess.run(['git', 'apply', '--index', str(patch_path)], check=True)
runner_patch = Path(HELPERS) / 'runner.patch'
require(hashlib.sha256(runner_patch.read_bytes()).hexdigest() == '9917b50e4f047d33f204b2b2f491895786cd92308f1bbb50372e775bf04c2068', 'Runner compatibility patch changed')
subprocess.run(['git', 'apply', '--index', str(runner_patch)], check=True)
subprocess.run(['git', 'rm', '-r', '--', HELPERS, WORKFLOW], check=True)
subprocess.run(['git', 'diff', '--cached', '--check'], check=True)
actual_tree = git('write-tree')
require(actual_tree == TREE, f'Candidate tree mismatch: {actual_tree}')
paths = git('diff', '--name-only', BASE, '--').splitlines()
require(len(paths) == 19, f'Unexpected changed file count: {len(paths)}')
require(not any(p.startswith('.github/') for p in paths), 'Temporary workflow leaked into candidate')
receipt = {'base': BASE, 'bootstrapCommit': os.environ['GITHUB_SHA'], 'candidateTree': actual_tree,
           'patchSha256': PATCH_SHA256, 'runnerPatchSha256': '9917b50e4f047d33f204b2b2f491895786cd92308f1bbb50372e775bf04c2068', 'patchBytes': len(patch), 'changedFiles': paths,
           'scope': 'fixed forecast overlay; excludes draft PR 46 snapshot persistence'}
(proof / 'preparation.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
