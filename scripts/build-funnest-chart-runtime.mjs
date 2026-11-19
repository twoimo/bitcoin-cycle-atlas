import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
assert(process.argv.length === 2 || process.argv.length === 3 && check, 'Usage: node scripts/build-funnest-chart-runtime.mjs [--check]');
const version = '0.6.22', upstream = 'e23919055dfca8d3051f4fc2946356269ab8372b';
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const webPackage = JSON.parse(await readFile(path.join(root, 'apps/web/package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(rootPackage.devDependencies['@funnest/charts'], version, 'Root Funnest engine pin changed');
for (const name of ['@funnest/charts', '@funnest/charts-react', '@funnest/charts-viz']) assert.equal(webPackage.dependencies[name], version, `${name} pin changed`);
const expected = new Map(), packages = [];
const licenseRoot = `dist/vendor/funnest-charts-${version}`;
for (const name of ['@funnest/charts', '@funnest/charts-react', '@funnest/charts-ui', '@funnest/charts-viz']) {
  const dir = path.join(root, 'node_modules', name), entry = lock.packages[`node_modules/${name}`];
  const installed = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(entry?.version, version, `${name} lockfile provenance changed`);
  assert.equal(installed.version, version, `${name} installed version changed`);
  assert.equal(installed.name, name);
  assert.match(entry.integrity, /^sha512-/);
  assert.equal(entry.resolved, `https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-${version}.tgz`);
  const prefix = name === '@funnest/charts' ? licenseRoot : `${licenseRoot}/${name.split('/')[1]}`;
  for (const file of ['LICENSE', 'NOTICE']) expected.set(`${prefix}/${file}.txt`, await readFile(path.join(dir, file)));
  packages.push({ name, version, license: installed.license, npmTarball: entry.resolved, integrity: entry.integrity });
}
const tightPriceAxisPlugin = {
  name: 'tight-price-axis',
  setup(build) {
    build.onLoad({ filter: /[\\/]@funnest[\\/]charts[\\/]dist[\\/]index\.js$/ }, async args => {
      let contents = await readFile(args.path, 'utf8');
      const swaps = [
        [
          '  const labelX = f.plotWidth + 8;\n  for (const price of f.priceTicks) {\n    const y = main.scale.priceToY(price);\n    if (y < 8 || y > main.height - 8) continue;\n    if (last && y > lastY - BADGE_HEIGHT && y < lastY + (f.countdown ? BADGE_HEIGHT * 2 - 4 : BADGE_HEIGHT)) continue;\n    p.text((main.tickFormat ?? m.formatPrice)(price), labelX, y, pal.textSecondary);\n  }',
          '  const labelRight = f.width - 8;\n  for (const price of f.priceTicks) {\n    const y = main.scale.priceToY(price);\n    if (y < 8 || y > main.height - 8) continue;\n    if (last && y > lastY - BADGE_HEIGHT && y < lastY + (f.countdown ? BADGE_HEIGHT * 2 - 4 : BADGE_HEIGHT)) continue;\n    p.text((main.tickFormat ?? m.formatPrice)(price), labelRight, y, pal.textSecondary, "right");\n  }',
        ],
        [
          '      p.text((pane.tickFormat ?? pane.format)(v), labelX, y, pal.textSecondary);',
          '      p.text((pane.tickFormat ?? pane.format)(v), labelRight, y, pal.textSecondary, "right");',
        ],
        [
          '    p.roundRect(f.plotWidth + 2, y - BADGE_HEIGHT / 2, f.width - f.plotWidth - 4, BADGE_HEIGHT, 4, badge.bg);\n    p.text(badge.text, labelX, y, badge.fg);',
          '    const badgeWidth = Math.ceil(p.measure(badge.text)) + 16;\n    p.roundRect(f.width - badgeWidth - 4, y - BADGE_HEIGHT / 2, badgeWidth, BADGE_HEIGHT, 4, badge.bg);\n    p.text(badge.text, labelRight, y, badge.fg, "right");',
        ],
        [
          '    p.roundRect(f.plotWidth + 2, y - BADGE_HEIGHT / 2, f.width - f.plotWidth - 4, h, 4, lastColor);\n    p.text(main.format(last.close), labelX, y, "#FFFFFF");\n    if (f.countdown) {\n      p.ctx.save();\n      p.ctx.globalAlpha = 0.85;\n      p.text(f.countdown, labelX, y + BADGE_HEIGHT - 4, "#FFFFFF");\n      p.ctx.restore();\n    }',
          '    const lastText = main.format(last.close);\n    const textWidth = Math.max(p.measure(lastText), f.countdown ? p.measure(f.countdown) : 0);\n    const lastBadgeWidth = Math.ceil(textWidth) + 16;\n    p.roundRect(f.width - lastBadgeWidth - 4, y - BADGE_HEIGHT / 2, lastBadgeWidth, h, 4, lastColor);\n    p.text(lastText, labelRight, y, "#FFFFFF", "right");\n    if (f.countdown) {\n      p.ctx.save();\n      p.ctx.globalAlpha = 0.85;\n      p.text(f.countdown, labelRight, y + BADGE_HEIGHT - 4, "#FFFFFF", "right");\n      p.ctx.restore();\n    }',
        ],
        [
          '  p.roundRect(f.plotWidth + 2, by - BADGE_HEIGHT / 2, f.width - f.plotWidth - 4, BADGE_HEIGHT, 4, pal.text);\n  p.text(valueLabel, f.plotWidth + 8, by, pal.background);',
          '  const crosshairBadgeWidth = Math.ceil(p.measure(valueLabel)) + 16;\n  p.roundRect(f.width - crosshairBadgeWidth - 4, by - BADGE_HEIGHT / 2, crosshairBadgeWidth, BADGE_HEIGHT, 4, pal.text);\n  p.text(valueLabel, f.width - 8, by, pal.background, "right");',
        ],
      ];
      for (const [from, to] of swaps) {
        assert.equal(contents.includes(from), true, `Price-axis anchor missing in ${args.path}`);
        contents = contents.replace(from, to);
      }
      return { contents, loader: 'js' };
    });
  },
};
const entries = [], sourceBytes = new Map();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
for (const source of ['src/charts/funnest-chart-runtime.js', 'src/charts/funnest-research-primitives.js']) {
  const sourcePath = path.join(root, source), bytes = await readFile(sourcePath);
  sourceBytes.set(sourcePath, bytes);
  const result = await build({
    absWorkingDir: root, stdin: { contents: bytes.toString(), resolveDir: path.dirname(sourcePath), sourcefile: source, loader: 'js' },
    bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], write: false,
    legalComments: 'inline', minify: false, sourcemap: false,
    plugins: [tightPriceAxisPlugin],
  });
  const bundle = `dist/${path.basename(source, '.js')}.bundle.js`, output = Buffer.from(result.outputFiles[0].contents);
  expected.set(bundle, output);
  entries.push({ source, sourceSha256: sha256(bytes), bundle, bundleSha256: sha256(output) });
}
const sourceSha256 = entries[0].sourceSha256;
expected.set(`${licenseRoot}/PROVENANCE.json`, Buffer.from(JSON.stringify({
  version, upstreamSnapshot: upstream, repository: `https://github.com/funnest-xyz/funnest-charts/tree/${upstream}`,
  source: 'src/charts/funnest-chart-runtime.js', sourceSha256, entries, packages,
}, null, 2) + '\n'));
for (const [sourcePath, bytes] of sourceBytes) assert.deepEqual(await readFile(sourcePath), bytes, `Runtime source changed during build: ${sourcePath}; retry after its owner finishes`);
for (const [relative, bytes] of expected) {
  const destination = path.join(root, relative);
  if (check) assert.deepEqual(await readFile(destination), bytes, `Stale generated Funnest artifact: ${relative}`);
  else { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
}
console.log(JSON.stringify({ status: check ? 'verified' : 'built', version, files: expected.size, sourceSha256, legalComments: 'inline' }));
