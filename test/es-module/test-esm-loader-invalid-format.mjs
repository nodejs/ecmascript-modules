// Flags: --experimental-modules --loader ./test/fixtures/es-module-loaders/loader-invalid-format.mjs
/* eslint-disable node-core/required-modules */
import { expectsError, mustCall } from '../common/index.mjs';
import assert from 'assert';

import('../fixtures/es-modules/test-esm-ok.mjs')
.then(assert.fail, expectsError({
  code: 'ERR_INVALID_RETURN_PROPERTY_VALUE',
  message: 'Expected string to be returned for the "format" from the ' +
           '"loader resolve" function but got type undefined.'
}))
.then(mustCall());
