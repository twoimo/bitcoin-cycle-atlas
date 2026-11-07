import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { verifyServedPublication } from './build-publication.mjs';
import { cloudflareAssetsPath, cloudflareRootConfigPath, cloudflareWorkerConfigPath, publicOrigin, sha256, verifyCloudflareArtifact, verifyGateReceipt } from './cloudflare-artifact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && !(args.length === 1 && ['--check', '--dry-run'].includes(args[0]))) throw new Error('Use --check or --dry-run for non-deploying validation; no other deploy arguments are supported');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30_000 }).trim();
const sourceCommit = git(['rev-parse', 'HEAD']);
const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Deploy only a clean committed checkout');
if (process.env.WORKERS_CI_COMMIT_SHA && process.env.WORKERS_CI_COMMIT_SHA !== sourceCommit) throw new Error('The build event and checked-out commit differ');

const artifact = JSON.parse(await readFile(resolve(root, 'build/cloudflare-artifact.json'), 'utf8'));
if (artifact.schemaVersion !== 1 || artifact.status !== 'PASS') throw new Error('Preview or incomplete artifacts cannot be deployed');
if (artifact.sourceCommit !== sourceCommit || artifact.sourceTree !== sourceTree) throw new Error('The packaged artifact belongs to a different committed source');
if (artifact.outputDirectory !== cloudflareAssetsPath) throw new Error('Unexpected Cloudflare output directory');
const origin = publicOrigin(process.env.ATLAS_PUBLIC_ORIGIN);
if (artifact.origin !== origin) throw new Error('The deployment origin differs from the reviewed artifact');
const gateBytes = await readFile(resolve(root, 'build/cloudflare-verification.json'));
verifyGateReceipt(JSON.parse(gateBytes), sourceCommit, sourceTree);
if (sha256(gateBytes) !== artifact.gateReceiptSha256) throw new Error('Verification receipt changed after packaging');
for (const [path, hash] of [[cloudflareWorkerConfigPath, artifact.workerConfigSha256], [cloudflareRootConfigPath, artifact.rootConfigSha256]]) {
  if (sha256(await readFile(resolve(root, path))) !== hash) throw new Error('Cloudflare configuration changed after packaging');
}
const identity = await verifyCloudflareArtifact({ directory: resolve(root, cloudflareAssetsPath), sourceDirectory: resolve(root, 'dist'), origin });
if (identity.sourceCommit !== sourceCommit || identity.manifestSha256 !== artifact.manifestSha256) throw new Error('Cloudflare publication identity changed after packaging');

const branch = process.env.ATLAS_PRODUCTION_BRANCH || 'main';
git(['check-ref-format', `refs/heads/${branch}`]);
if (process.env.WORKERS_CI_BRANCH && process.env.WORKERS_CI_BRANCH !== branch) throw new Error('Only the production branch can deploy');
const remoteHead = git(['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`]).split(/\s+/)[0];
if (remoteHead !== sourceCommit) throw new Error('A newer or different production source superseded this build');
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ status: 'PASS', scope: 'Pre-deployment source, complete verification and packaged identity; no deployment performed', ...identity }));
  process.exit(0);
}

execFileSync(process.execPath, [resolve(root, 'node_modules/cf/bin/cf'), 'deploy', '--prebuilt', '--mode', 'production', ...(args.includes('--dry-run') ? ['--dry-run'] : [])], {
  cwd: root, env: { ...process.env, CF_SEND_TELEMETRY: 'false' }, stdio: 'inherit',
});
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ status: 'DRY_RUN', scope: 'Cloudflare parsed the verified artifact without deployment', ...identity }));
  process.exit(0);
}
let confirmed, lastError;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    confirmed = await verifyServedPublication({ baseUrl: `${origin}/`, expectedManifest: identity.manifestSha256, expectedSource: sourceCommit });
    break;
  } catch (error) {
    lastError = error;
    console.error(`Served publication check ${attempt}/4 failed: ${error.message}`);
    if (attempt < 4) await setTimeout(10_000);
  }
}
if (!confirmed) throw lastError;
const receipt = { schemaVersion: 1, kind: 'atlas-cloudflare-deployment', origin, confirmedAt: new Date().toISOString(), ...confirmed };
await writeFile(resolve(root, 'build/cloudflare-deployment.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
