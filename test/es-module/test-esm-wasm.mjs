// Flags: --experimental-modules --experimental-wasm-modules
/* eslint-disable node-core/required-modules */
import wasmMod from '../fixtures/simple.wasm'
import {add} from '../fixtures/simple.wasm';
import {strictEqual} from 'assert';

strictEqual(wasmMod.add(10, 20), 30);
strictEqual(add(10, 20), 30);
strictEqual(wasmMod.add, add);
