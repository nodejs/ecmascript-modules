'use strict';
const common = require('../common');
const assert = require('assert');
const async_hooks = require('async_hooks');

let fail = false;
let initCnt = 0;

const bootstrapIds = new Set();

const hook = async_hooks.createHook({
  init(id, type, triggerAsyncId, resource, bootstrap) {
    if (bootstrap) {
      bootstrapIds.add(id);
      return;
    }
    initCnt++;
  },
  before(id) {
    if (bootstrapIds.has(id)) return;
    fail = true;
  },
  after(id) {
    if (bootstrapIds.has(id)) return;
    fail = true;
  },
  destroy(id) {
    if (bootstrapIds.has(id)) return;
    fail = true;
  }
});

assert.strictEqual(hook.enable(), hook);
assert.strictEqual(hook.enable(), hook);

setImmediate(common.mustCall());

assert.strictEqual(hook.disable(), hook);
assert.strictEqual(hook.disable(), hook);
assert.strictEqual(hook.disable(), hook);

process.on('exit', () => {
  assert.strictEqual(fail, false);
  assert.strictEqual(initCnt, 1);
});
