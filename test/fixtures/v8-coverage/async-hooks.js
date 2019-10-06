const async_hooks = require('async_hooks');
const common = require('../../common');

const bootstrapIds = new Set();
const hook = async_hooks.createHook({
  init (asyncId, type, triggerAsyncId, resource, bootstrap) {
    if (bootstrap) {
      bootstrapIds.add(asyncId);
      return;
    }
    common.mustNotCall();
  },
  before (asyncId) {
    if (bootstrapIds.has(asyncId)) return;
    common.mustNotCall();
  },
  after (asyncId) {
    if (bootstrapIds.has(asyncId)) return;
    common.mustNotCall();
  },
  destroy (asyncId) {
    if (bootstrapIds.has(asyncId)) return;
    common.mustNotCall();
  }
});

hook.enable();
