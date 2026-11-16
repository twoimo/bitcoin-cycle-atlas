import assert from 'node:assert/strict';
import test from 'node:test';
import {javascriptModuleReferences, javascriptModuleSpecifiers} from '../scripts/module-references.mjs';

const staticOptions = {includeDynamic:false};

test('static references retain source order across every import and re-export form', () => {
  const source = [
    'import "./side-effect.js?v=1";',
    'import defaultValue from "./default.js";',
    'import {one, two as alias} from "./named.js";',
    'import * as namespace from "./namespace.js";',
    'import combined, {three} from "./combined.js";',
    'import combinedNamespace, * as other from "./combined-namespace.js";',
    'export {one as publicOne} from "./named-reexport.js";',
    'export * from "./star-reexport.js";',
    'export * as all from "./namespace-reexport.js";',
    'export {default} from "./default-reexport.js";',
    'import snapshot from "./snapshot.json" with {type:"json"};',
    'export const localValue = 1; export {localValue};',
  ].join('\n');
  const expected = ['./side-effect.js?v=1', './default.js', './named.js', './namespace.js',
    './combined.js', './combined-namespace.js', './named-reexport.js', './star-reexport.js',
    './namespace-reexport.js', './default-reexport.js', './snapshot.json'];
  assert.deepEqual(javascriptModuleSpecifiers(source, staticOptions), expected);
  assert.deepEqual(javascriptModuleSpecifiers(source), expected);
});

test('static graphs omit literal and computed dynamic imports while defaults preserve lazy edges', () => {
  const source = [
    'import "./first.js";',
    'const lazy = import("./lazy.js?v=2");',
    'const json = import("./lazy.json", {with:{type:"json"}});',
    'const computed = import("./prefix/" + name);',
    'const template = import(`./${name}.js`);',
    'const variable = import(name);',
    'export * from "./last.js";',
  ].join('\n');
  assert.deepEqual(javascriptModuleSpecifiers(source, staticOptions), ['./first.js', './last.js']);
  const expected = ['./first.js', './lazy.js?v=2', './lazy.json', './last.js'];
  assert.deepEqual(javascriptModuleSpecifiers(source), expected);
  assert.deepEqual(javascriptModuleReferences(source), javascriptModuleReferences(source, {includeDynamic:true}));
  assert.deepEqual(javascriptModuleReferences(source), javascriptModuleReferences(source, {}));
});

test('comments, quoted prose, regular expressions, template text and import.meta add no static edges', () => {
  const source = [
    '// import "./line-comment.js";',
    '/* export * from "./block-comment.js"; */',
    'const quoted = \'import "./quoted-prose.js";\';',
    'const regexp = /import\\("ghost"\\)/;',
    'const template = `export * from "./template-text.js"; ${import("./nested-lazy.js")}`;',
    'const meta = import.meta.url;',
    'object.import("./method.js"); object?.import("./optional-method.js");',
    'import /* import "./inner-comment.js" */ {value} from /* comment */ "./real.js";',
  ].join('\n');
  assert.deepEqual(javascriptModuleSpecifiers(source, staticOptions), ['./real.js']);
  assert.deepEqual(javascriptModuleSpecifiers(source), ['./nested-lazy.js', './real.js']);
});

test('static references decode escapes but preserve exact original token spans and URL identities', () => {
  const source = String.raw`import value from "\x2e/first.js?v=one#part";
import './it\'s.js?v=2';
const lazy = import('./lazy.js');
export * from "./\u0073hared.js?v=3";
import "./shared.js?v=4";
import "./shared.js?v=3";`;
  const references = javascriptModuleReferences(source, staticOptions);
  assert.deepEqual(references.map(reference => reference.specifier), [
    './first.js?v=one#part', "./it's.js?v=2", './shared.js?v=3', './shared.js?v=4', './shared.js?v=3',
  ]);
  assert.deepEqual(references.map(({start,end}) => source.slice(start,end)), [
    String.raw`"\x2e/first.js?v=one#part"`, String.raw`'./it\'s.js?v=2'`,
    String.raw`"./\u0073hared.js?v=3"`, '"./shared.js?v=4"', '"./shared.js?v=3"',
  ]);
  assert.ok(references.every((reference,index) => index === 0 || reference.start > references[index-1].end));
});

test('scanner never evaluates static or lazy source while filtering its graph', () => {
  const source = 'throw new Error("must not execute"); import "./static.js"; await import("./lazy.js");';
  assert.deepEqual(javascriptModuleReferences(source, staticOptions).map(reference => Object.keys(reference)),
    [['specifier','start','end']]);
  assert.deepEqual(javascriptModuleSpecifiers(source, staticOptions), ['./static.js']);
  assert.deepEqual(javascriptModuleSpecifiers('import.meta.resolve("./runtime.js");', staticOptions), []);
  assert.deepEqual(javascriptModuleSpecifiers('', staticOptions), []);
});
