import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_ABSORPTION_RATIO, HITBOX_MULTIPLIERS } from '../shared/dist/constants.js';
import { HitRegion } from '../shared/dist/enums.js';
import { WEAPON_DEFINITIONS } from '../shared/dist/weapons.js';

test('headshot multiplier applies 2.0x base damage', () => {
  const rifle = WEAPON_DEFINITIONS['assault_rifle'];
  const baseDamage = rifle.damage; // 32
  const headshotMult = HITBOX_MULTIPLIERS[HitRegion.HEAD]; // 2.0
  const expectedRaw = baseDamage * headshotMult; // 64

  assert.equal(expectedRaw, 64);
});

test('armor absorbs 60% of raw damage until depleted', () => {
  const rawDamage = 50;
  const armorAbsorptionRatio = ARMOR_ABSORPTION_RATIO; // 0.60
  const initialArmor = 100;
  const initialHp = 100;

  const absorbed = Math.min(initialArmor, rawDamage * armorAbsorptionRatio); // 30
  const hpDamage = rawDamage - absorbed; // 20

  const finalArmor = initialArmor - absorbed; // 70
  const finalHp = initialHp - hpDamage; // 80

  assert.equal(absorbed, 30);
  assert.equal(finalHp, 80);
  assert.equal(finalArmor, 70);
});
