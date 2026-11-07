import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { checkPublication } from './build-publication.mjs';
import { assertCloudflareVerificationReceipt } from './cloudflare-build-contract.mjs';
import { assertStagedVerification } from './cloudflare-staged-contract.mjs';

export const cloudflareAssetsPath = '.cloudflare/output/v0/workers/default/assets';
export const cloudflareWorkerConfigPath = '.cloudflare/output/v0/workers/default/worker.config.json';
export const cloudflareRootConfigPath = '.cloudflare/output/v0/config.json';
export const redirects = '/bitcoin-cycle-atlas / 301\n/bitcoin-cycle-atlas/* /:splat 301\n';
export const headers = '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/publication.json\n  Cache-Control: no-store\n';
const formerOrigin = 'https://twoimo.github.io/bitcoin-cycle-atlas/';
const omitted = new Set(['.nojekyll', 'publication.json', 'publication.json.tmp']);
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function publicOrigin(input) {
  if (!input) throw new Error('ATLAS_PUBLIC_ORIGIN must identify the actual HTTPS deployment origin');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('ATLAS_PUBLIC_ORIGIN must be an HTTPS origin without credentials, query or path');
  }
  return url.origin;
}

export function deploymentHtml(html, origin) {
  const base = publicOrigin(origin);
  const rooted = /<meta name="atlas-root" content="[^"]*">/.test(html)
    ? html.replace(/<meta name="atlas-root" content="[^"]*">/g, '<meta name="atlas-root" content="/">')
    : html.replace('<head>', '<head><meta name="atlas-root" content="/">');
  return rooted.replaceAll(formerOrigin, `${base}/`);
}

export async function artifactFiles(directory, base = directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    const name = relative(base, path).split(sep).join('/');
    if (entry.isSymbolicLink()) throw new Error(`Static assets cannot contain symlinks: ${name}`);
    if (entry.name.startsWith('.') && name !== '.nojekyll') throw new Error(`Unreviewed hidden public path: ${name}`);
    if (name === '.nojekyll' && (!entry.isFile() || (await stat(path)).size !== 0)) throw new Error('The legacy .nojekyll marker must be an empty regular file');
    if (entry.isDirectory()) result.push(...await artifactFiles(path, base));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Static assets must be regular files: ${name}`);
  }
  return result;
}

export function isCopiedAsset(name) { return !omitted.has(name); }

export async function verifyCloudflareArtifact({ directory, sourceDirectory, origin, allowPreview = false }) {
  origin = publicOrigin(origin);
  const sourceFiles = (await artifactFiles(sourceDirectory)).filter(isCopiedAsset);
  const expectedFiles = [...sourceFiles, '_headers', '_redirects', 'publication.json'].sort();
  const actualFiles = (await artifactFiles(directory)).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error('Cloudflare asset inventory differs from the reviewed source and routing files');
  if (actualFiles.length > 20_000) throw new Error('Cloudflare Free static-asset file limit exceeded');
  let totalBytes = 0, largestBytes = 0;
  for (const name of actualFiles) {
    const info = await stat(resolve(directory, name));
    if (info.size > 25 * 1024 * 1024) throw new Error(`Cloudflare static-asset size limit exceeded: ${name}`);
    totalBytes += info.size; largestBytes = Math.max(largestBytes, info.size);
  }
  for (const name of sourceFiles) {
    const original = await readFile(resolve(sourceDirectory, name));
    const expected = name.endsWith('.html') ? Buffer.from(deploymentHtml(original.toString('utf8'), origin)) : original;
    const actual = await readFile(resolve(directory, name));
    if (!actual.equals(expected)) throw new Error(`Cloudflare packaging changed product bytes: ${name}`);
  }
  for (const [name, content] of [['_headers', headers], ['_redirects', redirects]]) {
    if (await readFile(resolve(directory, name), 'utf8') !== content) throw new Error(`Cloudflare routing policy changed: ${name}`);
  }
  for (const route of ['index.html', 'market-lab/index.html', 'market-lab/charts/index.html', 'market-lab/app/index.html']) {
    const html = await readFile(resolve(directory, route), 'utf8');
    if (!html.includes('<meta name="atlas-root" content="/">')) throw new Error(`Cloudflare route lost its root asset base: ${route}`);
    if (html.includes(formerOrigin)) throw new Error(`Cloudflare route retains the former publication origin: ${route}`);
  }
  const manifest = JSON.parse(await readFile(resolve(directory, 'publication.json'), 'utf8'));
  await checkPublication(manifest, { directory });
  if (!allowPreview && manifest.sourceTree?.status !== 'clean') throw new Error('A modified local preview cannot be deployed');
  return { files: actualFiles.length, totalBytes, largestBytes, sourceCommit: manifest.sourceCommit, manifestSha256: manifest.manifestSha256 };
}

export function verifyGateReceipt(receipt, sourceCommit, sourceTree) {
  if (receipt?.kind === 'atlas-cloudflare-staged-verification') return assertStagedVerification(receipt, { sourceCommit, sourceTree });
  // A successful component is deliberately not a product deployment receipt.
  // The legacy path still requires all23 gates in one actual complete run.
  return assertCloudflareVerificationReceipt(receipt, { sourceCommit, sourceTree });
}
