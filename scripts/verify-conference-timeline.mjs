#!/usr/bin/env node
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateConferenceTimeline} from '../dist/conference/timeline.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const usage = 'Usage: node scripts/verify-conference-timeline.mjs --timeline PATH --sources PATH [--out PATH]';

export async function verifyConferenceTimeline({timelinePath, sourcesPath}) {
  if (!timelinePath || !sourcesPath) throw new TypeError(usage + '; --sources must be independent subtitle rows.');
  const [timelineBytes, sourceBytes] = await Promise.all([readFile(timelinePath), readFile(sourcesPath)]);
  const data = JSON.parse(timelineBytes.toString('utf8'));
  const inventory = JSON.parse(sourceBytes.toString('utf8'));
  const validation = validateConferenceTimeline(data, {sourceSegments:inventory?.segments, requireCoverage:true});
  const errors = [...validation.errors];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory) || inventory.schemaVersion !== 1
      || inventory.kind !== 'atlas-conference-source-segments') {
    errors.push({code:'source_inventory_schema', path:'sources', message:'Source inventory must use schemaVersion 1 and kind atlas-conference-source-segments.'});
  }
  if (inventory?.eventId !== data?.event?.id) errors.push({code:'source_event', path:'sources.eventId', message:'Independent source inventory must belong to this timeline event.'});
  const valid = errors.length === 0;
  return {
    schemaVersion:1, kind:'atlas-conference-timeline-verification', recordedAt:new Date().toISOString(),
    status:valid ? 'passed' : 'failed', valid,
    syntheticFixture:data?.synthetic === true && inventory?.synthetic === true,
    timeline:{file:resolve(timelinePath),bytes:timelineBytes.length,sha256:hash(timelineBytes)},
    sources:{file:resolve(sourcesPath),bytes:sourceBytes.length,sha256:hash(sourceBytes)},
    summary:validation.summary, errors,
  };
}

export async function main(args = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--timeline','--sources','--out'].includes(key) || !value || value.startsWith('--') || values[key]) throw new TypeError(usage);
    values[key] = value;
  }
  if (values['--out'] && [values['--timeline'],values['--sources']].filter(Boolean).some(file => resolve(file) === resolve(values['--out']))) {
    throw new TypeError('Verification output must not overwrite either input file.');
  }
  const report = await verifyConferenceTimeline({timelinePath:values['--timeline'],sourcesPath:values['--sources']});
  const content = JSON.stringify(report, null, 2) + '\n';
  if (values['--out']) { const file = resolve(values['--out']); await mkdir(dirname(file), {recursive:true}); await writeFile(file, content); }
  process.stdout.write(content);
  return report.valid ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
