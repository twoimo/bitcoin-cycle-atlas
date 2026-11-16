#!/usr/bin/env python3
from pathlib import Path
import datetime, hashlib, json
root = Path('/vercel/bitcoin-cycle-atlas/build/h1-final-53')
report_bytes = (root / 'report.json').read_bytes()
report = json.loads(report_bytes)
shots = [shot for case in report['cases'] for shot in case['screenshots']]
failures = []
for shot in shots:
    try:
        data = (root / shot['file']).read_bytes()
        assert len(data) == shot['bytes'], 'byte count differs'
        assert hashlib.sha256(data).hexdigest() == shot['sha256'], 'SHA-256 differs'
        assert data[:8] == b'\x89PNG\r\n\x1a\n', 'PNG signature differs'
    except Exception as error:
        failures.append({'file': shot['file'], 'error': str(error)})
receipt = {
    'kind': 'native-browser-screenshot-integrity',
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceCommit': report['sourceCommit'],
    'reportOriginalSha256': hashlib.sha256(report_bytes).hexdigest(),
    'checkerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'checkedScreenshots': len(shots),
    'uniqueScreenshotFiles': len({shot['file'] for shot in shots}),
    'checks': ['file exists', 'byte length', 'SHA-256', 'PNG signature'],
    'failed': failures,
    'status': 'passed' if not failures else 'failed'
}
(root / 'native-53-images-validation.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
assert not failures
