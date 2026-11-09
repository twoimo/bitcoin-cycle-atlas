import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// These are synthetic contract tests, never a receipt for the missing conference media.
const script = resolve('scripts/conference/prepare-media.py');
const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
function evaluate(code) {
  const result = spawnSync(python, ['-B', '-c', `import runpy,sys,json,tempfile,pathlib,hashlib\nm=runpy.run_path(sys.argv[1])\n${code}`, script], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, `Python runtime required for media contract tests: ${result.error}`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
const configCode = `
config={
 'schemaVersion':1,'eventId':'plspo-2026-10-31','inputsConfirmed':True,'inputRoot':'.','existingAssetCount':1000,
 'finalPdf':{'path':'final.pdf','sha256':'a'*64},
 'r17Pdf':{'path':'r17.pdf','sha256':'b'*64,'approvedSha256':'b'*64,'variant':'clean'},
 'audioSources':[{'id':'plaud-1','path':'one.mp3','sha256':'c'*64,'t0':0,'durationSec':18000},
                 {'id':'plaud-2','path':'two.mp3','sha256':'d'*64,'t0':18000,'durationSec':2400}],
 'render':{'longEdge':1800,'quality':80},
 'audio':{'format':'opus','split':'chunk','bitrateKbps':40,'chunkSeconds':700,'sessions':None}}
`;

test('media example remains blocked without input confirmation, paths, full hashes and §7 decisions', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'atlas-media-pending-'));
  try {
    const result = spawnSync(python, ['-B', script, '--config', 'scripts/conference/media_config.example.json', '--out', resolve(directory, 'out'), '--check'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const receipt = JSON.parse(result.stderr);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.mediaPrepared, false);
    assert.match(receipt.reason, /inputsConfirmed/);
    const example = JSON.parse(readFileSync('scripts/conference/media_config.example.json', 'utf8'));
    assert.equal(example.r17Pdf.variant, null);
    assert.equal(example.audio.format, null);
    assert.equal(example.audio.split, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const [name, modification, expected] of [
  ['a hash prefix', "config['finalPdf']['sha256']='4b1affb46789400a'", 'full lowercase SHA-256'],
  ['an unapproved R17 revision', "config['r17Pdf']['approvedSha256']='e'*64", 'approval must pin'],
  ['an undecided R17 variant', "config['r17Pdf']['variant']=None", 'variant is undecided'],
  ['an undecided audio codec', "config['audio']['format']=None", 'format is undecided'],
  ['an undecided physical split', "config['audio']['split']=None", 'split is undecided'],
  ['a wrong recording offset', "config['audioSources'][1]['t0']=17330", 'timing must be'],
  ['a repeated source id', "config['audioSources'][1]['id']='plaud-1'", 'plaud-1 then plaud-2'],
  ['an unmeasured existing asset count', "config['existingAssetCount']=None", 'existingAssetCount'],
]) {
  test(`media preflight rejects ${name}`, () => {
    const result = evaluate(`${configCode}\n${modification}\ntry:\n m['validate_config'](config)\n raise AssertionError('invalid configuration accepted')\nexcept m['MediaError'] as e:\n print(json.dumps({'reason':str(e)}))`);
    assert.ok(result.reason.includes(expected), result.reason);
  });
}

test('chunk planning splits a straddling chunk at the 17:33 recording boundary without time loss', () => {
  const spans = evaluate(`${configCode}\nm['validate_config'](config)\nprint(json.dumps(m['plan_audio'](config)))`);
  assert.equal(spans[0].t0, 0);
  assert.equal(spans.at(-1).t1, 20400);
  assert.equal(spans.reduce((sum, row) => sum + row.plannedDurationSec, 0), 20400);
  assert.ok(spans.some(row => row.t1 === 18000 && row.sourceId === 'plaud-1'));
  const second = spans.find(row => row.t0 === 18000);
  assert.equal(second.sourceId, 'plaud-2');
  assert.equal(second.sourceOffsetSec, 0);
  assert.equal(second.clockStart, '17:33:00');
  for (let index = 1; index < spans.length; index++) assert.equal(spans[index - 1].t1, spans[index].t0);
  for (const row of spans) {
    assert.ok(row.t1 > row.t0);
    assert.ok(!row.file.includes('..'));
    assert.ok(row.sourceOffsetSec + row.plannedDurationSec <= (row.sourceId === 'plaud-1' ? 18000 : 2400));
  }
});

test('session split requires reviewed 00..14 coverage and retains a session across the recording seam', () => {
  const spans = evaluate(`${configCode}\nconfig['audio'].update(split='session',chunkSeconds=None,sessions=[{'id':f'{i:02d}','title':'synthetic session','t0':i*1360,'t1':(i+1)*1360} for i in range(15)])\nm['validate_config'](config)\nprint(json.dumps(m['plan_audio'](config)))`);
  const seam = spans.filter(row => row.sessionId === '13');
  assert.equal(seam.length, 2);
  assert.deepEqual(seam.map(row => row.sourceId), ['plaud-1', 'plaud-2']);
  assert.equal(seam[0].t1, seam[1].t0);
  assert.equal(new Set(spans.map(row => row.sessionId)).size, 15);
});

test('session gaps, overlaps, missing sessions and non-finite boundaries fail rather than silently trim', () => {
  const result = evaluate(`
base=[{'id':f'{i:02d}','title':'synthetic session','t0':i*1360,'t1':(i+1)*1360} for i in range(15)]
failures=[]
for kind in ['gap','overlap','missing','nan']:
 rows=[dict(x) for x in base]
 if kind=='gap': rows[1]['t0']+=1
 if kind=='overlap': rows[1]['t0']-=1
 if kind=='missing': rows.pop()
 if kind=='nan': rows[1]['t1']=float('nan')
 try: m['validate_sessions'](rows)
 except m['MediaError']: failures.append(kind)
print(json.dumps(failures))`);
  assert.deepEqual(result, ['gap', 'overlap', 'missing', 'nan']);
});

test('the file-count gate includes existing deployed assets and the new media manifest', () => {
  const result = evaluate(`${configCode}\nconfig['existingAssetCount']=20000-547\ntry:\n m['plan_audio'](config)\n raise AssertionError('asset count overflow accepted')\nexcept m['MediaError'] as e:\n print(json.dumps(str(e)))`);
  assert.match(result, /20,000/);
});

test('source hashing rejects wrong bytes, traversal, symlinks and empty files', () => {
  const result = evaluate(`
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory)
 (root/'real.bin').write_bytes(b'synthetic source bytes')
 (root/'empty.bin').write_bytes(b'')
 (root/'link.bin').symlink_to(root/'real.bin')
 valid=hashlib.sha256(b'synthetic source bytes').hexdigest()
 assert m['source_file'](root,{'path':'real.bin','sha256':valid},'fixture')==root/'real.bin'
 cases=[('wrong','real.bin','0'*64),('traversal','../real.bin',valid),('symlink','link.bin',valid),('empty','empty.bin',hashlib.sha256(b'').hexdigest())]
 failures=[]
 for name,path,digest in cases:
  try: m['source_file'](root,{'path':path,'sha256':digest},'fixture')
  except m['MediaError']: failures.append(name)
 print(json.dumps(failures))`);
  assert.deepEqual(result, ['wrong', 'traversal', 'symlink', 'empty']);
});

test('full input hash validation also blocks absolute paths outside the declared input root', () => {
  const result = evaluate(`
with tempfile.TemporaryDirectory() as directory:
 parent=pathlib.Path(directory)
 root=parent/'inputs'; root.mkdir()
 outside=parent/'outside.bin'; outside.write_bytes(b'outside')
 try:
  m['source_file'](root,{'path':str(outside),'sha256':hashlib.sha256(b'outside').hexdigest()},'fixture')
  raise AssertionError('outside path accepted')
 except m['MediaError'] as e: print(json.dumps(str(e)))`);
  assert.match(result, /within inputRoot/);
});

test('audio duration mismatch is reported instead of padding or claiming a matching event clock', () => {
  const result = evaluate(`
m['validate_duration'](600.025,600,'fixture')
try:
 m['validate_duration'](599.8,600,'fixture')
 raise AssertionError('duration mismatch accepted')
except m['MediaError'] as e: print(json.dumps(str(e)))`);
  assert.match(result, /differs.*0.05s/);
});

test('existing output and symlink ancestors are rejected before processing', () => {
  const result = evaluate(`
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory)
 existing=root/'existing'; existing.mkdir(); (existing/'keep.txt').write_text('preserved')
 link=root/'link'; link.symlink_to(existing,target_is_directory=True)
 failures=[]
 for label,path in [('existing',existing),('symlink',link/'new')]:
  try: m['validate_output_path'](path)
  except m['MediaError']: failures.append(label)
 assert (existing/'keep.txt').read_text()=='preserved'
 print(json.dumps(failures))`);
  assert.deepEqual(result, ['existing', 'symlink']);
});

test('atomic publication refuses a destination created after preflight and preserves both trees', () => {
  const result = evaluate(`
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory)
 stage=root/'stage'; stage.mkdir(); (stage/'new.txt').write_text('new')
 dest=root/'dest'
 m['validate_output_path'](dest)
 dest.mkdir(); (dest/'keep.txt').write_text('old')
 try:
  m['publish_directory'](stage,dest)
  raise AssertionError('existing destination replaced')
 except m['MediaError'] as e:
  assert (dest/'keep.txt').read_text()=='old'
  assert (stage/'new.txt').read_text()=='new'
  print(json.dumps(str(e)))`);
  assert.match(result, /preserved|requires Linux renameat2/);
});

test('atomic publication completes on Linux and explicitly blocks an unsupported operating system', () => {
  const result = evaluate(`
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory)
 stage=root/'stage'; stage.mkdir(); (stage/'done.txt').write_text('complete')
 dest=root/'dest'
 if sys.platform.startswith('linux'):
  m['publish_directory'](stage,dest)
  assert not stage.exists()
  print(json.dumps((dest/'done.txt').read_text()))
 else:
  try:
   m['publish_directory'](stage,dest)
   raise AssertionError('unsupported publication unexpectedly accepted')
  except m['MediaError']:
   assert stage.exists() and not dest.exists()
   print(json.dumps('unsupported platform explicitly blocked'))`);
  assert.equal(result, process.platform === 'linux' ? 'complete' : 'unsupported platform explicitly blocked');
});

test('asset size checks use exactly 25 MiB and reject an extra byte or an empty file', () => {
  const result = evaluate(`
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory); path=root/'asset.bin'
 with path.open('wb') as stream: stream.truncate(25*1024*1024)
 accepted=m['asset_record'](path,root)['sizeBytes']
 rejected=[]
 for size in [25*1024*1024+1,0]:
  with path.open('wb') as stream: stream.truncate(size)
  try: m['asset_record'](path,root)
  except m['MediaError']: rejected.append(size)
 print(json.dumps({'accepted':accepted,'rejected':rejected}))`);
  assert.deepEqual(result, { accepted: 26214400, rejected: [26214401, 0] });
});
