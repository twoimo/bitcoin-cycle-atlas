import assert from 'node:assert/strict';

export const DAY=86400;
const center=range=>(range.start+range.end+range.step)/2;
export function preserved(before,after,domain){
  assert.ok(Math.abs(center(after.range)-center(before.range))<=after.range.step/2,'interval conversion keeps the UTC center within the target grid');
  assert.ok(Math.abs((after.range.end-after.range.start+after.range.step)-(before.range.end-before.range.start+before.range.step))<after.range.step,'time duration changes by less than one target interval');
  assert.deepEqual(after.priceDomain,domain);assert.ok(Number.isInteger((after.range.start-after.range.min)/after.range.step));assert.ok(Number.isInteger((after.range.end-after.range.min)/after.range.step));
}
