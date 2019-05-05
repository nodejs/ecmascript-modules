// Flags: --experimental-modules --experimental-wasm-modules
/* eslint-disable node-core/required-modules */
import { add, addImported } from '../fixtures/es-modules/simple.wasm';
import { strictEqual } from 'assert';

strictEqual(add(10, 20), 30);

strictEqual(addImported(0), 42);
strictEqual(addImported(1), 43);
