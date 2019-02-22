# ECMAScript Modules

<!--introduced_in=v8.5.0-->
<!-- type=misc -->

> Stability: 1 - Experimental

<!--name=esm-->

Node.js contains support for ES Modules based upon the
[Node.js EP for ES Modules][] and the [ESM Minimal Kernel][].

The minimal feature set is designed to be compatible with all potential
future implementations. Expect major changes in the implementation including
interoperability support, specifier resolution, and default behavior.

## Enabling

<!-- type=misc -->

The `--experimental-modules` flag can be used to enable features for loading
ESM modules.

Once this has been set, files ending with `.mjs` will be able to be loaded
as ES Modules.

```sh
node --experimental-modules my-app.mjs
```

## Features

<!-- type=misc -->

### Supported

Only the CLI argument for the main entry point to the program can be an entry
point into an ESM graph. Dynamic import can also be used to create entry points
into ESM graphs at runtime.

#### import.meta

* {Object}

The `import.meta` metaproperty is an `Object` that contains the following
property:

* `url` {string} The absolute `file:` URL of the module.

### Unsupported

| Feature | Reason |
| --- | --- |
| `require('./foo.mjs')` | ES Modules have differing resolution and timing, use dynamic import |

## Notable differences between `import` and `require`

### Only Support for .mjs

ESM must have the `.mjs` extension.

### Mandatory file extensions

You must provide a file extension when using the `import` keyword.

### No importing directories

There is no support for importing directories.

### No NODE_PATH

`NODE_PATH` is not part of resolving `import` specifiers. Please use symlinks
if this behavior is desired.

### No `require.extensions`

`require.extensions` is not used by `import`. The expectation is that loader
hooks can provide this workflow in the future.

### No `require.cache`

`require.cache` is not used by `import`. It has a separate cache.

### URL based paths

ESM are resolved and cached based upon [URL](https://url.spec.whatwg.org/)
semantics. This means that files containing special characters such as `#` and
`?` need to be escaped.

Modules will be loaded multiple times if the `import` specifier used to resolve
them have a different query or fragment.

```js
import './foo.mjs?query=1'; // loads ./foo.mjs with query of "?query=1"
import './foo.mjs?query=2'; // loads ./foo.mjs with query of "?query=2"
```

For now, only modules using the `file:` protocol can be loaded.

## CommonJS, JSON, and Native Modules

CommonJS, JSON, and Native modules can be used with [`module.createRequireFromPath()`][].

```js
// cjs.js
module.exports = 'cjs';

// esm.mjs
import { createRequireFromPath as createRequire } from 'module';
import { fileURLToPath as fromPath } from 'url';

const require = createRequire(fromPath(import.meta.url));

const cjs = require('./cjs');
cjs === 'cjs'; // true
```

## Builtin modules

Builtin modules will provide named exports of their public API, as well as a
default export which can be used for, among other things, modifying the named
exports. Named exports of builtin modules are updated when the corresponding
exports property is accessed, redefined, or deleted.

```js
import EventEmitter from 'events';
const e = new EventEmitter();
```

```js
import { readFile } from 'fs';
readFile('./foo.txt', (err, source) => {
  if (err) {
    console.error(err);
  } else {
    console.log(source);
  }
});
```

```js
import fs, { readFileSync } from 'fs';

fs.readFileSync = () => Buffer.from('Hello, ESM');

fs.readFileSync === readFileSync;
```

[Node.js EP for ES Modules]: https://github.com/nodejs/node-eps/blob/master/002-es-modules.md
[`module.createRequireFromPath()`]: modules.html#modules_module_createrequirefrompath_filename
[ESM Minimal Kernel]: https://github.com/nodejs/modules/blob/master/doc/plan-for-new-modules-implementation.md
