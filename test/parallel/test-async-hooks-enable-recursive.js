'use strict';

const common = require('../common');
const async_hooks = require('async_hooks');
const fs = require('fs');
const assert = require('assert');

let nestedCnt = 0;
let hookCnt = 0;

const nestedHook = async_hooks.createHook({
  init(id, type, triggerAsyncId, resource, bootstrap) {
    if (bootstrap) return;
    nestedCnt++;
  }
});

async_hooks.createHook({
  init(id, type, triggerAsyncId, resource, bootstrap) {
    if (bootstrap) return;
    hookCnt++;
    nestedHook.enable();
  }
}).enable();

fs.access(__filename, common.mustCall(() => {
  fs.access(__filename, common.mustCall());
}));

process.on('exit', () => {
  assert.strictEqual(hookCnt, 2);
  assert.strictEqual(nestedCnt, 1);
});
