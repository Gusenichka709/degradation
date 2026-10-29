import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EFFECT_FROM, effectStrength, thresholdIndex, type Effect } from '@game/shared';

test('помехи включаются на своих порогах и с глубиной только усиливаются', () => {
  const at = (percent: number) =>
    (Object.keys(EFFECT_FROM) as Effect[]).filter((effect) => effectStrength(effect, thresholdIndex(percent)) > 0).sort();

  assert.deepEqual(at(0), []);
  assert.deepEqual(at(34), []);
  assert.deepEqual(at(35), ['blot']);
  assert.deepEqual(at(45), ['blot', 'vignette']);
  assert.deepEqual(at(55), ['blot', 'glimpse', 'vignette']);
  assert.deepEqual(at(65), ['blot', 'cracks', 'glimpse', 'vignette']);
  assert.deepEqual(at(75), ['blot', 'colors', 'cracks', 'glimpse', 'vignette']);
  assert.deepEqual(at(85), ['blot', 'colors', 'cracks', 'glimpse', 'names', 'vignette']);
  assert.deepEqual(at(95), ['blot', 'colors', 'cracks', 'glimpse', 'interface', 'names', 'vignette']);
  assert.deepEqual(at(100), ['blot', 'colors', 'cracks', 'glimpse', 'interface', 'names', 'truth', 'vignette']);

  for (const effect of Object.keys(EFFECT_FROM) as Effect[]) {
    assert.equal(effectStrength(effect, thresholdIndex(EFFECT_FROM[effect])), 1, `${effect}: на своём пороге сила 1`);
    for (let band = 1; band <= 11; band++) {
      assert.ok(effectStrength(effect, band) >= effectStrength(effect, band - 1), `${effect} ослабла на пороге ${band}`);
    }
  }
});
