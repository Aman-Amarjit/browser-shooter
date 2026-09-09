import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlayerInput, validateShotCommand } from '../shared/dist/validation.js';

test('validatePlayerInput accepts valid inputs within range', () => {
  const input = {
    inputSequence: 10,
    clientTimeMs: 1000,
    forward: 1,
    strafe: 0,
    yaw: 0.5,
    pitch: 0.2,
    jump: false,
    crouch: false,
    sprint: false,
    fire: false,
    reload: false,
    weaponSlot: 1
  };

  const res = validatePlayerInput(input, 5, 12);
  assert.equal(res.isValid, true);
});

test('validatePlayerInput rejects out-of-order sequence numbers', () => {
  const input = {
    inputSequence: 5,
    clientTimeMs: 1000,
    forward: 1,
    strafe: 0,
    yaw: 0,
    pitch: 0,
    jump: false,
    crouch: false,
    sprint: false,
    fire: false,
    reload: false,
    weaponSlot: 1
  };

  const res = validatePlayerInput(input, 5, 12);
  assert.equal(res.isValid, false);
  assert.equal(res.reason, 'Duplicate or out-of-order sequence');
});

test('validateShotCommand rejects firing when dead', () => {
  const shot = {
    inputSequence: 10,
    clientFireTime: 1000,
    origin: { x: 0, y: 1.6, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
    weaponId: 'assault_rifle'
  };

  const res = validateShotCommand(shot, true, 0, 1000);
  assert.equal(res.isValid, false);
  assert.equal(res.reason, 'Dead player cannot fire');
});

test('validateShotCommand rejects firing faster than weapon fire rate', () => {
  const shot = {
    inputSequence: 10,
    clientFireTime: 1000,
    origin: { x: 0, y: 1.6, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
    weaponId: 'assault_rifle'
  };

  // Assault rifle fire interval is 100ms. Attempting to fire at 50ms interval should fail.
  const res = validateShotCommand(shot, false, 950, 1000);
  assert.equal(res.isValid, false);
  assert.equal(res.reason, 'Fire rate exceeds weapon maximum');
});
