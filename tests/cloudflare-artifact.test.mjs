import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, deploymentHtml, headers, publicOrigin, redirects, verifyCloudflareArtifact } from '../scripts/cloudflare-artifact.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://atlas.example.com';

async function fixture(t) {
  const directory = await mkdtemp(resolve(tmpdir(), 'atlas-cloudflare-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceDirectory = resolve(directory, 'source'), output = resolve(directory, 'assets');
  const html = '<!doctype html><html><head><meta name="atlas-root" content="/bitcoin-cycle-atlas/"><link rel="canonical" href="https://twoimo.github.io/bitcoin-cycle-atlas/"></head><body><a href="?page=eth">ETH</a></body></html>';
  const series = JSON.stringify({ currency: 'USD', prices: [['2026-11-05', 123.45]], meta: { retrievedAt: '2026-11-06T01:00:00Z' } });
  const values = {
    'index.html': html, 'market-lab/index.html': html, 'market-lab/charts/index.html': html, 'market-lab/app/index.html': html,
    'site-entry.js': 'export const checked = true;\n',
    'data/btc-daily.json': series, 'data/eth-ohlc.json': series, 'data/mstr-ohlc.json': series, 'data/bmnr-ohlc.json': series,
    'data/asset-comparison.json': JSON.stringify({ assets: [{ symbol: 'HYPE', currency: 'USDC', prices: [['2026-11-05', 84.007]], meta: { sourceUrl: 'https://api.hyperliquid.xyz/info' } }] }),
  };
  for (const [name, value] of Object.entries(values)) {
    for (const base of [sourceDirectory, output]) {
      await mkdir(dirname(resolve(base, name)), { recursive: true });
      await writeFile(resolve(base, name), base === output && name.endsWith('.html') ? deploymentHtml(value, origin) : value);
    }
  }
  await writeFile(resolve(output, '_headers'), headers);
  await writeFile(resolve(output, '_redirects'), redirects);
  const env = { ...process.env };
  delete env.WORKERS_CI_COMMIT_SHA;
  await run(process.execPath, ['scripts/build-publication.mjs', '--directory', output, '--preview'], { cwd: root, env });
  return { sourceDirectory, directory: output, origin, allowPreview: true };
}

test('deployment HTML changes only the site origin and asset root while preserving deep-link state', () => {
  const html = '<head><link rel="canonical" href="https://twoimo.github.io/bitcoin-cycle-atlas/"></head><a href="../../?page=housing&region=seoul">주택</a>';
  const result = deploymentHtml(html, origin);
  assert.match(result, /<meta name="atlas-root" content="\/">/);
  assert.ok(result.includes(`href="${origin}/"`));
  assert.ok(result.includes('href="../../?page=housing&region=seoul"'));
  assert.equal(publicOrigin(`${origin}/`), origin);
  for (const value of ['', 'http://atlas.example.com', 'https://user:pass@atlas.example.com', `${origin}/charts`, `${origin}/?token=x`]) {
    assert.throws(() => publicOrigin(value));
  }
});

test('publication binds the transformed artifact and retains original chart values and quote units', async t => {
  const options = await fixture(t);
  const result = await verifyCloudflareArtifact(options);
  assert.equal(result.files, (await artifactFiles(options.directory)).length);
  const manifest = JSON.parse(await readFile(resolve(options.directory, 'publication.json'), 'utf8'));
  assert.equal(manifest.assets.find(asset => asset.symbol === 'HYPE').currency, 'USDC');
  assert.equal(manifest.assets.find(asset => asset.symbol === 'HYPE').latestPrice, 84.007);
  await run(process.execPath, ['scripts/build-publication.mjs', '--directory', options.directory, '--check'], { cwd: root });
  const priceFile = resolve(options.directory, 'data/btc-daily.json');
  const previous = await readFile(priceFile);
  await writeFile(priceFile, previous.toString().replace('123.45', '321.45'));
  await assert.rejects(verifyCloudflareArtifact(options), /changed product bytes/);
  await writeFile(priceFile, previous);
  await writeFile(resolve(options.directory, 'unreviewed.js'), 'export const x = 1;');
  await assert.rejects(verifyCloudflareArtifact(options), /inventory differs/);
});

test('a different Workers build commit cannot rewrite a prepared artifact manifest', async t => {
  const options = await fixture(t);
  const path = resolve(options.directory, 'publication.json');
  const before = await readFile(path);
  await assert.rejects(run(process.execPath, ['scripts/build-publication.mjs', '--directory', options.directory, '--preview'], {
    cwd: root, env: { ...process.env, WORKERS_CI_COMMIT_SHA: '0'.repeat(40) },
  }), /does not match the checked-out commit/);
  assert.deepEqual(await readFile(path), before);
});

test('packaging rejects hidden public files and permits only the empty legacy site marker', async t => {
  const options = await fixture(t);
  const marker = resolve(options.sourceDirectory, '.nojekyll');
  await writeFile(marker, '');
  assert.ok((await artifactFiles(options.sourceDirectory)).includes('.nojekyll'));
  await writeFile(marker, 'unreviewed');
  await assert.rejects(artifactFiles(options.sourceDirectory), /must be an empty regular file/);
  await rm(marker);
  await writeFile(resolve(options.sourceDirectory, '.secret'), 'unreviewed');
  await assert.rejects(artifactFiles(options.sourceDirectory), /hidden public path/);
});
