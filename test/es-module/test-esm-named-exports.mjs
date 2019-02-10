// Flags: --experimental-modules
/* eslint-disable node-core/required-modules */
import '../common/index.mjs';
import {
  name as name1,
  execTime as execTime1
} from '../fixtures/es-modules/cjs1.js';
import {
  name as name2,
  execTime as execTime2, 你好
} from '../fixtures/es-modules/cjs2.js';
import assert from 'assert';

assert.strictEqual(name1, 'value');
assert.strictEqual(name2, 'value');
assert.strictEqual(你好, 'yay');
assert(execTime1 < execTime2);
