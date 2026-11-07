import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, cloudflareAssetsPath, cloudflareRootConfigPath, cloudflareWorkerConfigPath, deploymentHtml, headers, isCopiedAsset, publicOrigin, redirects, sha256, verifyCloudflareArtifact, verifyGateReceipt } from './cloudflare-artifact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && !(args.length === 1 && args[0] === '--preview')) throw new Error('Use no arguments for production packaging or --preview for a non-deployable local artifact');
const preview = process.argv.includes('--preview');
const origin = publicOrigin(process.env.ATLAS_PUBLIC_ORIGIN);
const domain = process.env.ATLAS_CUSTOM_DOMAIN?.trim();
if (domain && new URL(origin).hostname !== domain.toLowerCase()) throw new Error('The custom domain and public origin must identify the same site');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
const gatePath = resolve(root, 'build/cloudflare-verification.json');
let gateBytes = null;
if (!preview) {
  gateBytes = await readFile(gatePath);
  verifyGateReceipt(JSON.parse(gateBytes), sourceCommit, sourceTree);
}
const staged = resolve(root, 'build/cloudflare-assets');
await rm(staged, { recursive: true, force: true });
await mkdir(staged, { recursive: true });
const sourceDirectory = resolve(root, 'dist');
const sourceFiles = await artifactFiles(sourceDirectory);
if (sourceFiles.includes('.nojekyll')) execFileSync('git', ['ls-files', '--error-unmatch', '--', 'dist/.nojekyll'], { cwd: root, stdio: 'pipe' });
for (const name of sourceFiles.filter(isCopiedAsset)) {
  const original = await readFile(resolve(sourceDirectory, name));
  const destination = resolve(staged, name);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, name.endsWith('.html') ? deploymentHtml(original.toString('utf8'), origin) : original);
}
await writeFile(resolve(staged, '_headers'), headers);
await writeFile(resolve(staged, '_redirects'), redirects);
const env = { ...process.env, CF_SEND_TELEMETRY: 'false' };
// cf build's framework detector rejects npm workspace roots. Invoking the
// official Vite build directly produces the same cf prebuilt output contract.
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.ts', '--mode', 'production'], { cwd: root, env, stdio: 'inherit' });
const directory = resolve(root, cloudflareAssetsPath);
execFileSync(process.execPath, ['scripts/build-publication.mjs', '--directory', directory, ...(preview ? ['--preview'] : [])], { cwd: root, env, stdio: 'inherit' });
const identity = await verifyCloudflareArtifact({ directory, sourceDirectory, origin, allowPreview: preview });
const workerConfigBytes = await readFile(resolve(root, cloudflareWorkerConfigPath));
const workerConfig = JSON.parse(workerConfigBytes);
if (workerConfig.manifest || workerConfig.entrypoint || workerConfig.bindings || workerConfig.assets?.runWorkerFirst) throw new Error('Cloudflare publication must remain an assets-only Worker without runtime bindings');
const receipt = {
  schemaVersion: 1, status: preview ? 'PREVIEW' : 'PASS', preparedAt: new Date().toISOString(), origin,
  ...identity, sourceTree,
  outputDirectory: cloudflareAssetsPath,
  gateReceiptSha256: gateBytes ? sha256(gateBytes) : null,
  workerConfigSha256: sha256(workerConfigBytes),
  rootConfigSha256: sha256(await readFile(resolve(root, cloudflareRootConfigPath))),
};
await writeFile(resolve(root, 'build/cloudflare-artifact.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ ...receipt, scope: 'Local packaged assets and configuration; deployment and served identity are not confirmed' }));
