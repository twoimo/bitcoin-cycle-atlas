#!/usr/bin/env node
// Rebind an already verified ready package to the current site's file inventory.
// Rendering provenance and all media bytes stay unchanged. No browser is started.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, readdir, lstat, realpath, mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {countRetainedSiteFiles} from './prepare-conference-media.mjs';
import {inspectInstalledConferenceMedia} from './conference-media-server.mjs';
import {validateConferenceMediaManifest} from '../dist/conference/media.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = fileURLToPath(import.meta.url);
const MANIFEST = 'conference/media-manifest.json';
const TIMELINE = 'conference/timeline.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pretty = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const inside = (parent, child) => {
  const rest = relative(parent, child);
  return rest === '' || !isAbsolute(rest) && rest !== '..' && !rest.startsWith('..' + sep);
};

async function futurePath(path) {
  let current = resolve(path);
  const absent = [];
  while (true) {
    try { return resolve(await realpath(current), ...absent.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      absent.push(basename(current)); current = dirname(current);
    }
  }
}

async function inventory(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes:true})) {
    const file = prefix ? prefix + '/' + entry.name : entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Symbolic link in site inventory: ' + file);
    if (entry.isDirectory()) files.push(...await inventory(root, file));
    else { assert.ok(entry.isFile(), 'Non-regular site file: ' + file); files.push(file); }
  }
  return files.sort();
}

export async function refreshConferenceMediaSite({siteDist = join(ROOT, 'dist'), dist, out} = {}) {
  assert.ok(dist, '--dist must name an existing isolated site with ready media');
  const source = await realpath(resolve(siteDist)), target = await realpath(resolve(dist));
  const canonical = await realpath(join(ROOT, 'dist'));
  assert.ok(!inside(source, target) && !inside(target, source)
    && !inside(canonical, target) && !inside(target, canonical),
  'Refusing canonical/source dist: use a separate isolated site');
  const receiptPath = out && await futurePath(out);
  if (receiptPath) {
    assert.ok(![source, target, canonical].some(root => inside(root, receiptPath)),
      'Receipt must be outside every counted site');
    try { await lstat(receiptPath); throw new Error('Receipt output already exists: ' + receiptPath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  const manifestPath = join(target, MANIFEST), originalBytes = await readFile(manifestPath);
  const sourceTimeline = await readFile(join(source, TIMELINE));
  const sourceFiles = await inventory(source), targetFiles = await inventory(target);
  // A stale count is an input to preparation, never a passing preflight result.
  // Every other schema, identity, missing-file and unexpected-media error stops us.
  const before = await inspectInstalledConferenceMedia({dist:target});
  assert.ok(before.manifest?.status === 'ready' && !before.skipped, 'An existing ready manifest is required');
  assert.ok(before.errors.every(error => error.code === 'site_file_count'),
    'Installed media must verify before refresh: ' + JSON.stringify(before.errors));
  assert.equal(before.counts.verifiedAssetCount, before.manifest.assets.length, 'Every media asset must verify');
  assert.equal(sha(originalBytes), before.identities.manifest.sha256, 'Ready manifest changed during inspection');
  assert.equal(sha(sourceTimeline), before.identities.timeline.sha256, 'Isolated timeline differs from current site');
  assert.equal(sourceTimeline.length, before.identities.timeline.bytes, 'Isolated timeline byte count differs');

  const planned = [...before.manifest.assets.map(asset => asset.file), 'media-manifest.json'];
  const replaced = new Set(planned.map(file => 'conference/' + file));
  const retained = files => files.filter(file => !replaced.has(file));
  assert.deepEqual(retained(targetFiles), retained(sourceFiles), 'Isolated retained paths differ from current site');
  const existingSiteFileCount = await countRetainedSiteFiles(source, planned);
  assert.equal(existingSiteFileCount, retained(sourceFiles).length, 'Source inventory changed during counting');
  const siteFileCount = existingSiteFileCount + before.manifest.assets.length + 1;
  assert.equal(before.counts.observedSiteFileCount, siteFileCount,
    'Installed site count must equal the recalculated count before refresh');
  const manifest = structuredClone(before.manifest);
  Object.assign(manifest.totals, {existingSiteFileCount, siteFileCount});
  const bytes = pretty(manifest);
  const validation = validateConferenceMediaManifest(manifest, {timeline:before.timeline,
    timelineSha256:sha(sourceTimeline), manifestBytes:bytes.length});
  assert.ok(validation.valid && validation.available, 'Recalculated manifest is invalid: ' + JSON.stringify(validation.errors));

  const changed = before.manifest.totals.existingSiteFileCount !== existingSiteFileCount
    || before.manifest.totals.siteFileCount !== siteFileCount;
  // Temporary/backup/receipt files must never inflate the counted site itself.
  let temporary = null, published = false;
  try {
    if (changed) {
      temporary = await mkdtemp(join(dirname(target), '.conference-site-count-'));
      const next = join(temporary, 'next.json');
      await writeFile(next, bytes, {flag:'wx'});
      assert.deepEqual(await readFile(manifestPath), originalBytes, 'Ready manifest changed before publication');
      assert.deepEqual(await inventory(source), sourceFiles, 'Source inventory changed before publication');
      assert.deepEqual(await inventory(target), targetFiles, 'Installed inventory changed before publication');
      await rename(next, manifestPath); published = true;
    }
    const after = await inspectInstalledConferenceMedia({dist:target});
    assert.ok(after.passed, 'Unchanged installed-media preflight failed: ' + JSON.stringify(after.errors));
    assert.deepEqual(after.manifest, manifest, 'Ready manifest changed after publication');
    assert.deepEqual(after.assets, before.assets, 'Media identities changed during refresh');
    assert.deepEqual(await inventory(source), sourceFiles, 'Source inventory changed during refresh');
    assert.deepEqual(await inventory(target), targetFiles, 'Installed inventory changed during refresh');
    assert.deepEqual(await readFile(join(source, TIMELINE)), sourceTimeline, 'Source timeline changed during refresh');
    const result = {schemaVersion:1, kind:'conference-media-site-count-refresh', status:'passed',
      mode:changed ? 'refreshed' : 'unchanged', siteDist:source, dist:target,
      before:{existingSiteFileCount:before.manifest.totals.existingSiteFileCount,
        siteFileCount:before.manifest.totals.siteFileCount, preflightStatus:before.status, errors:before.errors},
      totals:{existingSiteFileCount, assetCount:manifest.assets.length, siteFileCount},
      observedSourceFileCount:sourceFiles.length, observedSiteFileCount:after.counts.observedSiteFileCount,
      verifiedAssetCount:after.counts.verifiedAssetCount,
      manifest:{beforeSha256:sha(originalBytes), afterSha256:after.identities.manifest.sha256,
        changedFields:changed ? ['totals.existingSiteFileCount', 'totals.siteFileCount'] : []},
      mediaBytesChanged:0, retainedPathsChanged:0, preflightPassed:after.passed, browserStarted:false};
    if (receiptPath) {
      await mkdir(dirname(receiptPath), {recursive:true});
      await writeFile(receiptPath, pretty(result), {flag:'wx'});
    }
    return result;
  } catch (error) {
    if (published) {
      // Restore only our own just-published manifest, never a concurrent replacement.
      try {
        assert.deepEqual(await readFile(manifestPath), bytes, 'Manifest changed concurrently; rollback refused');
        const rollback = join(temporary, 'original.json');
        await writeFile(rollback, originalBytes, {flag:'wx'}); await rename(rollback, manifestPath);
      } catch (rollbackError) { error.message += '; rollback failed: ' + rollbackError.message; }
    }
    throw error;
  } finally { if (temporary) await rm(temporary, {recursive:true, force:true}); }
}

export function parseSiteRefreshArguments(args) {
  const options = {}, names = new Map([['--site-dist','siteDist'], ['--dist','dist'], ['--out','out']]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help') { options.help = true; continue; }
    assert.ok(names.has(flag), 'Unknown argument: ' + flag);
    const value = args[++index], name = names.get(flag);
    assert.ok(value && !value.startsWith('--'), 'Missing value for ' + flag);
    assert.ok(!(name in options), 'Duplicate ' + flag); options[name] = value;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === ENTRY) {
  try {
    const options = parseSiteRefreshArguments(process.argv.slice(2));
    if (options.help) console.log('Usage: node scripts/refresh-conference-media-site.mjs --site-dist dist --dist ISOLATED_SITE [--out RECEIPT.json]\nRecalculates only ready-manifest site counts after all installed asset hashes verify. Canonical dist, existing media bytes and render provenance are preserved. Uses the unchanged installed-media preflight before and after; never launches a browser.');
    else console.log(JSON.stringify(await refreshConferenceMediaSite(options), null, 2));
  } catch (error) { console.error('conference-media-site: ' + error.message); process.exitCode = 1; }
}
