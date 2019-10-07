'use strict';
const common = require('../common');
const assert = require('assert');
const async_hooks = require('async_hooks');

// Checks that enabling async hooks in a callback actually
// triggers after & destroy as expected.

const fnsToTest = [setTimeout, (cb) => {
  setImmediate(() => {
    cb();

    // We need to keep the event loop open for this to actually work
    // since destroy hooks are triggered in unrefed Immediates
    setImmediate(() => {
      hook.disable();
    });
  });
}, (cb) => {
  process.nextTick(() => {
    cb();

    // We need to keep the event loop open for this to actually work
    // since destroy hooks are triggered in unrefed Immediates
    setImmediate(() => {
      hook.disable();
      assert.strictEqual(fnsToTest.length, 0);
    });
  });
}];

let beforeCnt = 0;
let afterCnt = 0;
let destroyCnt = 0;

const hook = async_hooks.createHook({
  before(asyncId) {
    beforeCnt++;
  },
  after(asyncId) {
    afterCnt++;
  },
  destroy(asyncId) {
    destroyCnt++;
    hook.disable();
    nextTest();
  }
});

nextTest();

function nextTest() {
  if (fnsToTest.length > 0) {
    fnsToTest.shift()(common.mustCall(() => {
      hook.enable();
    }));
  }
}

process.on('nextTick', () => {
  assert.strictEqual(beforeCnt, 0);
  assert.strictEqual(afterCnt, 3);
  assert.strictEqual(destroyCnt, 3);
});
