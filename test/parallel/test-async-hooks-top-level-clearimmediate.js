'use strict';

// Regression test for https://github.com/nodejs/node/issues/13262

const common = require('../common');
const assert = require('assert');
const async_hooks = require('async_hooks');

if (!common.isMainThread)
  common.skip('Worker bootstrapping works differently -> different async IDs');

let seenId, seenResource;

const bootstrapIds = new Set();

let fail = false;
let firstNonBootstrapTriggerId;

async_hooks.createHook({
  init(id, provider, triggerAsyncId, resource, bootstrap) {
    if (bootstrap) {
      bootstrapIds.add(id);
      return;
    } else if (!firstNonBootstrapTriggerId) {
      firstNonBootstrapTriggerId = triggerAsyncId;
    }
    seenId = id;
    seenResource = resource;
    assert.strictEqual(provider, 'Immediate');
    assert.strictEqual(triggerAsyncId, firstNonBootstrapTriggerId);
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
    assert.strictEqual(seenId, id);
  }
}).enable();

const immediate = setImmediate(common.mustNotCall());
assert.strictEqual(immediate, seenResource);
clearImmediate(immediate);

process.on('exit', () => {
  assert.strictEqual(fail, false);
});
