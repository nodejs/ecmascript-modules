'use strict';

const common = require('../common');
const async_hooks = require('async_hooks');
const fs = require('fs');
const assert = require('assert');

const nestedHook = async_hooks.createHook({
  init: common.mustNotCall()
});
let nestedCall = false;

let cnt = 0;
async_hooks.createHook({
  init(asyncId, type) {
    if (type === 'PROMISE' || type === 'TickObject')
      return;
    cnt++;
    nestedHook.enable();
    if (!nestedCall) {
      nestedCall = true;
      fs.access(__filename, common.mustCall());
    }
  }
}).enable();

fs.access(__filename, common.mustCall());

assert.strictEqual(cnt, 2);
