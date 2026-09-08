const test = require('node:test');
const assert = require('node:assert/strict');
const { LOAN_STATUSES, canTransition } = require('../src/services/loanState');

test('loan states are explicit and terminal states are known', () => {
  assert.deepEqual(LOAN_STATUSES, ['requested', 'refused', 'cancelled', 'active', 'returned']);
  for (const terminal of ['refused', 'cancelled', 'returned']) {
    assert.equal(canTransition(terminal, 'requested'), false);
    assert.equal(canTransition(terminal, 'active'), false);
    assert.equal(canTransition(terminal, 'returned'), false);
  }
});

test('requested loans can be accepted, refused, or cancelled', () => {
  assert.equal(canTransition('requested', 'active'), true);
  assert.equal(canTransition('requested', 'refused'), true);
  assert.equal(canTransition('requested', 'cancelled'), true);
});

test('active loans can be cancelled or returned, but not requested again', () => {
  assert.equal(canTransition('active', 'cancelled'), true);
  assert.equal(canTransition('active', 'returned'), true);
  assert.equal(canTransition('active', 'requested'), false);
  assert.equal(canTransition('active', 'refused'), false);
});

test('unknown statuses and self-transitions are rejected', () => {
  assert.equal(canTransition('unknown', 'active'), false);
  for (const status of LOAN_STATUSES) assert.equal(canTransition(status, status), false);
});
