// Flags: --experimental-modules --loader ./test/fixtures/es-module-loaders/missing-dynamic-instantiate-hook.mjs
/* eslint-disable node-core/required-modules */

import { expectsError } from '../common/index.mjs';

import('test').catch(expectsError({
  code: 'ERR_MISSING_DYNAMIC_INSTANTIATE_HOOK',
  message: 'The ES Module loader may not return a format of \'dynamic\' ' +
    'when no dynamicInstantiate function was provided'
}));
