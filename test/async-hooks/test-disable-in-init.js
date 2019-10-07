'use strict';

const common = require('../common');
const async_hooks = require('async_hooks');
const fs = require('fs');
const assert = require('assert');

let nestedCall = false;
let cnt = 0;

async_hooks.createHook({
  init: function(asyncId, type, triggerAsyncId, handle, bootstrap) {
    if (type === 'TickObject' || type === 'PROMISE')
      return;
    cnt++;
    nestedHook.disable();
    if (!nestedCall) {
      nestedCall = true;
      fs.access(__filename, common.mustCall());
    }
  }
}).enable();

const nestedHook = async_hooks.createHook({
  init: function(asyncId, type, triggerAsyncId, handle, bootstrap) {
    cnt++;
  }
}).enable();

fs.access(__filename, common.mustCall());

assert.strictEqual(cnt, 4);
