'use strict';
const common = require('../common');
const assert = require('assert');
const async_hooks = require('async_hooks');

if (!common.isMainThread)
  common.skip('Worker bootstrapping works differently -> different async IDs');

const promiseAsyncIds = [];
const bootstrapIds = new Set();

let initCnt = 0;
let beforeCnt = 0;
let afterCnt = 0;
let firstTriggerId;

async_hooks.createHook({
  init(id, type, triggerId, resource, bootstrap) {
    if (bootstrap) {
      bootstrapIds.add(id);
      return;
    } else if (!firstTriggerId) {
      firstTriggerId = triggerId;
    }
    initCnt++;
    if (type === 'PROMISE') {
      // Check that the last known Promise is triggering the creation of
      // this one.
      assert.strictEqual(promiseAsyncIds[promiseAsyncIds.length - 1] ||
          firstTriggerId, triggerId);
      promiseAsyncIds.push(id);
    }
  },
  before(id) {
    if (bootstrapIds.has(id)) return;
    beforeCnt++;
    assert.strictEqual(id, promiseAsyncIds[1]);
  },
  after(id) {
    if (bootstrapIds.has(id)) return;
    afterCnt++;
    assert.strictEqual(id, promiseAsyncIds[1]);
  }
}).enable();

Promise.resolve(42).then(common.mustCall(() => {
  assert.strictEqual(async_hooks.executionAsyncId(), promiseAsyncIds[1]);
  assert.strictEqual(async_hooks.triggerAsyncId(), promiseAsyncIds[0]);
  Promise.resolve(10);
}));

process.on('exit', () => {
  assert.strictEqual(initCnt, 3);
  assert.strictEqual(beforeCnt, 1);
  assert.strictEqual(afterCnt, 1);
});
