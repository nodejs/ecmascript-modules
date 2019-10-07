'use strict';
const common = require('../common');
const async_hooks = require('async_hooks');
const assert = require('assert');

if (!common.isMainThread)
  common.skip('Worker bootstrapping works differently -> different AsyncWraps');

const bootstrapIds = new Set();

let initCnt = 0;
let beforeCnt = 0;
let afterCnt = 0;

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
    beforeCnt++;
  },
  after(id) {
    if (bootstrapIds.has(id)) return;
    afterCnt++;
  }
}).enable();

Promise.resolve(1).then(common.mustCall(() => {
  hook.disable();

  Promise.resolve(42).then(common.mustCall());

  process.nextTick(common.mustCall());
}));

process.on('exit', () => {
  assert.strictEqual(initCnt, 2);
  assert.strictEqual(beforeCnt, 1);
  assert.strictEqual(afterCnt, 0);
});
