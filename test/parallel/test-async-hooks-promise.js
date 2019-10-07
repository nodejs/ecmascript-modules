'use strict';
const common = require('../common');
const assert = require('assert');
const async_hooks = require('async_hooks');

if (!common.isMainThread)
  common.skip('Worker bootstrapping works differently -> different async IDs');

const initCalls = [];
const resolveCalls = [];

const bootstrapIds = new Set();
let firstTriggerId;

async_hooks.createHook({
  init(id, type, triggerId, resource, bootstrap) {
    if (bootstrap) {
      bootstrapIds.add(id);
      return;
    } else if (!firstTriggerId) {
      firstTriggerId = triggerId;
    }
    assert.strictEqual(type, 'PROMISE');
    initCalls.push({ id, triggerId, resource });
  },
  promiseResolve(id) {
    if (bootstrapIds.has(id)) return;
    assert.strictEqual(initCalls[resolveCalls.length].id, id);
    resolveCalls.push(id);
  }
}).enable();

const a = Promise.resolve(42);
a.then(common.mustCall());

assert.strictEqual(initCalls[0].triggerId, firstTriggerId);
assert.strictEqual(initCalls[0].resource.isChainedPromise, false);
assert.strictEqual(initCalls[1].triggerId, initCalls[0].id);
assert.strictEqual(initCalls[1].resource.isChainedPromise, true);
