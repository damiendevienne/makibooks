const test = require('node:test');
const assert = require('node:assert/strict');
const { emailNotificationsEnabled } = require('../src/services/emailPreference');

test('email notification preference normalizes stored boolean values', () => {
  assert.equal(emailNotificationsEnabled(false), false);
  assert.equal(emailNotificationsEnabled(0), false);
  assert.equal(emailNotificationsEnabled('false'), false);
  assert.equal(emailNotificationsEnabled('0'), false);
  assert.equal(emailNotificationsEnabled(true), true);
  assert.equal(emailNotificationsEnabled(undefined), true);
});
