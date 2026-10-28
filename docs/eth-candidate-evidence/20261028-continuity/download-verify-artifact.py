import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import time
import urllib.parse
import urllib.request
import zipfile

request_path, zip_path, output_path, receipt_path = map(Path, sys.argv[1:])
request = json.loads(request_path.read_bytes())
artifact = request['artifact']
url = request['downloadUrl']
parsed = urllib.parse.urlsplit(url)
assert parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password
expected_size = artifact['size_in_bytes']
assert isinstance(expected_size, int) and 0 < expected_size <= 256 * 1024 * 1024
expected_digest = artifact['digest']
assert expected_digest.startswith('sha256:') and len(expected_digest) == 71
assert artifact['name'] == 'eth-candidate-evidence-' + request['sourceCommit']
assert artifact['workflow_run']['id'] == request['runId']
assert artifact['workflow_run']['head_sha'] == request['sourceCommit']
assert not artifact['expired']
assert not zip_path.exists() and not output_path.exists() and not receipt_path.exists()
started_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
digest = hashlib.sha256()
downloaded = 0
with urllib.request.urlopen(url, timeout=60) as response, zip_path.open('xb') as output:
    assert response.status == 200
    while True:
        block = response.read(1024 * 1024)
        if not block:
            break
        downloaded += len(block)
        assert downloaded <= expected_size
        digest.update(block)
        output.write(block)
assert downloaded == expected_size
assert digest.hexdigest() == expected_digest[7:]
inventory = []
with zipfile.ZipFile(zip_path) as archive:
    entries = archive.infolist()
    assert 0 < len(entries) <= 20000
    names = set()
    total_uncompressed = 0
    for entry in entries:
        name = entry.filename
        assert name and '\\' not in name and '\x00' not in name and name not in names
        names.add(name)
        pure = PurePosixPath(name)
        assert not pure.is_absolute() and all(part not in ('', '.', '..') for part in pure.parts)
        assert not name.startswith('/') and '//' not in name
        mode = (entry.external_attr >> 16) & 0xFFFF
        kind = stat.S_IFMT(mode)
        assert kind in (0, stat.S_IFREG, stat.S_IFDIR) and not stat.S_ISLNK(mode)
        assert not (entry.flag_bits & 1)
        assert 0 <= entry.file_size <= 128 * 1024 * 1024
        total_uncompressed += entry.file_size
        assert total_uncompressed <= 1024 * 1024 * 1024
        if entry.is_dir():
            assert entry.file_size == 0
    assert archive.testzip() is None
    output_path.mkdir()
    for entry in entries:
        destination = output_path.joinpath(*PurePosixPath(entry.filename).parts)
        if entry.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        body = archive.read(entry)
        assert len(body) == entry.file_size
        with destination.open('xb') as out:
            out.write(body)
        inventory.append({'path': entry.filename, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
receipt = {
    'schemaVersion': 1,
    'kind': 'eth-continuity-artifact-download-and-extraction',
    'status': 'verified',
    'startedAt': started_at,
    'finishedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'artifactId': artifact['id'],
    'workflowRunId': request['runId'],
    'sourceCommit': request['sourceCommit'],
    'artifactName': artifact['name'],
    'artifactCreatedAt': artifact['created_at'],
    'artifactExpiresAt': artifact['expires_at'],
    'zipBytes': downloaded,
    'zipSha256': digest.hexdigest(),
    'githubDigestMatch': True,
    'zipCrcVerified': True,
    'safePathsVerified': True,
    'symlinksRejected': True,
    'duplicateNamesRejected': True,
    'extractedFiles': len(inventory),
    'extractedBytes': total_uncompressed,
    'allFileInventory': sorted(inventory, key=lambda item: item['path']),
    'downloadedCodeExecuted': False,
    'releaseAuthorized': False,
}
receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
request_path.unlink()
print(json.dumps({key: value for key, value in receipt.items() if key != 'allFileInventory'}, ensure_ascii=False))
