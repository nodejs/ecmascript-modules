// Flags: --experimental-modules --experimental-json-modules
/* eslint-disable node-core/required-modules */
import '../common/index.mjs';

import { strictEqual, deepStrictEqual } from 'assert';

import { createRequireFromPath as createRequire } from 'module';
import { fileURLToPath as fromURL } from 'url';

import mod from '../fixtures/es-modules/json-cache/mod.cjs';
import another from '../fixtures/es-modules/json-cache/another.cjs';
import test from '../fixtures/es-modules/json-cache/test.json';

const require = createRequire(fromURL(import.meta.url));

const modCjs = require('../fixtures/es-modules/json-cache/mod.cjs');
const anotherCjs = require('../fixtures/es-modules/json-cache/another.cjs');
const testCjs = require('../fixtures/es-modules/json-cache/test.json');

strictEqual(mod.one, 1);
strictEqual(another.one, 'zalgo');
strictEqual(test.one, 'it comes');

deepStrictEqual(mod, modCjs);
deepStrictEqual(another, anotherCjs);
deepStrictEqual(test, testCjs);
