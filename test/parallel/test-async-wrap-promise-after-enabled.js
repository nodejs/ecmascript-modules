'use strict';

// Regression test for https://github.com/nodejs/node/issues/13237

const common = require('../common');
const assert = require('assert');

if (!common.isMainThread)
  common.skip('Worker bootstrapping works differently -> different timing');

const async_hooks = require('async_hooks');

const seenEvents = [];

let fail = false;
let beforeCnt = 0;
let afterCnt = 0;

const p = new Promise((resolve) => resolve(1));
p.then(() => seenEvents.push('then'));

const bootstrapIds = new Set();

const hooks = async_hooks.createHook({
  init(id, type, triggerAsyncId, resource, bootstrap) {
    if (bootstrap) {
      bootstrapIds.add(id);
      return;
    }
    fail = true;
  },

  before(id) {
    if (bootstrapIds.has(id)) return;
    beforeCnt++;
    assert.ok(id > 1);
    seenEvents.push('before');
  },

  after(id) {
    if (bootstrapIds.has(id)) return;
    assert.ok(id > 1);
    afterCnt++;
    seenEvents.push('after');
    hooks.disable();
  }
});

setImmediate(() => {
  assert.deepStrictEqual(seenEvents, ['before', 'then', 'after']);
  assert.strictEqual(fail, false);
  assert.strictEqual(beforeCnt, 1);
  assert.strictEqual(afterCnt, 1);
});

hooks.enable(); // After `setImmediate` in order to not catch its init event.
