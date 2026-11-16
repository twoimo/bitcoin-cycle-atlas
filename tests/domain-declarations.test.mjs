import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildEthReviewPacket} from '../scripts/build-eth-review-packet.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const domain = join(root, 'packages/domain');
const {name: packageName, exports: entries} = JSON.parse(await readFile(join(domain, 'package.json'), 'utf8'));
const modules = Object.entries(entries).filter(([, target]) => target.endsWith('.js'))
  .map(([subpath, target]) => ({specifier: packageName + subpath.slice(1), source: join(domain, target)}));

const localTypes = {
  'market-lab-math.js': [['let status = stats.status', 'string']],
  'rsi-simulation.js': [['const next=', "{side:'Buy'|'Sell',tranche:1|2,level:number}[]"]],
};

function bind(source, file, specifier) {
  let bound = source.replace(/^export (?:const|function) (\w+)/gm, (line, name) => `/** @type {Declared['${name}']} */ ${line}`);
  for (const [anchor, type] of localTypes[file] ?? []) {
    assert.equal(bound.split(anchor).length, 2, `${file} must contain \`${anchor}\` exactly once`);
    bound = bound.replace(anchor, `/** @type {${type}} */ ${anchor}`);
  }
  return bound + `\n/** @typedef {typeof import('${specifier}')} Declared */\n`;
}

test('hand-written declarations type-check against the JavaScript they describe', async t => {
  await mkdir(join(root, 'build'), {recursive: true});
  const copies = await mkdtemp(join(root, 'build/domain-declarations-'));
  t.after(() => rm(copies, {recursive: true, force: true}));
  for (const {specifier, source} of modules) {
    const bound = bind(await readFile(source, 'utf8'), basename(source), specifier);
    assert.match(bound, /@type \{Declared\[/, `${specifier} has no exports to check`);
    await writeFile(join(copies, basename(source)), bound);
  }
  await writeFile(join(copies, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', allowJs: true, checkJs: true, strict: false, noEmit: true, skipLibCheck: true, types: ['node']},
    files: modules.map(({source}) => basename(source)),
  }));
  try {
    execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', copies], {cwd: root, encoding: 'utf8'});
  } catch (error) { assert.fail((error.stdout || error.message).replaceAll(relative(root, copies) + '/', 'packages/domain/src/')); }
});

for (const {specifier, source} of modules) {
  test(`${specifier} declares only values the module exports`, async () => {
    const declared = [...(await readFile(source.replace(/\.js$/, '.d.ts'), 'utf8')).matchAll(/^export (?:function|const) (\w+)/gm)].map(match => match[1]);
    const actual = await import(pathToFileURL(source).href);
    assert.ok(declared.length > 0);
    assert.deepEqual(declared.filter(exported => !(exported in actual)), []);
  });
}

test('published market math needs no source outside the ETH review packet', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'domain-review-packet-'));
  t.after(() => rm(fixture, {recursive: true, force: true}));
  await mkdir(join(fixture, 'dist'));
  await copyFile(new URL('../dist/market-lab-math.js', import.meta.url), join(fixture, 'dist/market-lab-math.js'));
  const git = args => execFileSync('git', args, {cwd: fixture, stdio: 'ignore'});
  git(['init']); git(['add', '--', 'dist']);
  git(['-c', 'user.name=Domain fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Published market math']);
  const manifest = await buildEthReviewPacket({repositoryRoot: fixture, seedPaths: ['dist/market-lab-math.js']});
  assert.deepEqual(manifest.unresolvedImports, []);
});
