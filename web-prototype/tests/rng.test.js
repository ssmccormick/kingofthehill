import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rngNext, normalizeSeed } from '../src/logic/rng.js';

test('same seed gives the same sequence', () => {
  const a = { rng: 42 }, b = { rng: 42 };
  const sa = Array.from({ length: 10 }, () => rngNext(a));
  const sb = Array.from({ length: 10 }, () => rngNext(b));
  assert.deepEqual(sa, sb);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('string seeds hash deterministically', () => {
  assert.equal(normalizeSeed('hill'), normalizeSeed('hill'));
  assert.notEqual(normalizeSeed('hill'), normalizeSeed('hilk'));
});
