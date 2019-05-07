'use strict';

const { JSON } = primordials;
const debug = require('internal/util/debuglog').debuglog('esm');

/* global WebAssembly */

module.exports = function createWASMModule(module, url) {
  debug('creating WASM facade for %s with exports: %j', url, exports);

  const imports = WebAssembly.Module.imports(module);
  const importModules = new Set();
  imports.forEach(({ module }) => importModules.add(module));

  const source = `const imports = Object.create(null);
${[...importModules].map((module) => {
    const specifierStr = JSON.stringify(module);
    const importNames = new Set(
      imports
      .filter(({ module: m }) => m === module)
      .map(({ name }) => name)
    );
    const impts =
        [...importNames].map((name) => `${name} as $${name}`).join(', ');
    const defs = [...importNames].map((name) => `${name}: $${name}`).join(', ');
    return `import { ${impts} } from ${specifierStr};
    imports[${specifierStr}] = { ${defs} };`;
  }).join('\n')}
const { exports } = new WebAssembly.Instance(import.meta.module, imports);
${WebAssembly.Module.exports(module)
  .map(({ name }) => `export const ${name} = exports.${name};`).join('\n')}
  `;

  const { ModuleWrap, callbackMap } = internalBinding('module_wrap');
  const m = new ModuleWrap(source, `${url}`);

  callbackMap.set(m, {
    initializeImportMeta: (meta, wrap) => {
      meta.module = module;
    },
  });

  return {
    module: m,
    reflect: undefined
  };
};
