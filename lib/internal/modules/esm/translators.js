'use strict';

const { NativeModule } = require('internal/bootstrap/loaders');
const { ModuleWrap, callbackMap } = internalBinding('module_wrap');
const {
  stripShebang
} = require('internal/modules/cjs/helpers');
const CJSModule = require('internal/modules/cjs/loader');
const { URL, fileURLToPath } = require('url');
const createDynamicModule = require(
  'internal/modules/esm/create_dynamic_module');
const fs = require('fs');
const {
  SafeMap,
} = primordials;
const { debuglog, promisify } = require('util');
const esmLoader = require('internal/process/esm_loader');
const { isValidIdentifier } = require('internal/validators');

const readFileAsync = promisify(fs.readFile);

const debug = debuglog('esm');

const translators = new SafeMap();
exports.translators = translators;

function initializeImportMeta(meta, { url }) {
  meta.url = url;
}

async function importModuleDynamically(specifier, { url }) {
  const loader = await esmLoader.loaderPromise;
  return loader.import(specifier, url);
}

// Strategy for loading a standard JavaScript module
translators.set('esm', function(url) {
  const modulePromise = (async () => {
    const source = `${await readFileAsync(new URL(url))}`;
    debug(`Translating StandardModule ${url}`);
    const module = new ModuleWrap(stripShebang(source), url);
    callbackMap.set(module, {
      initializeImportMeta,
      importModuleDynamically,
    });
    return {
      module,
      reflect: undefined,
    };
  })();
  return { modulePromise };
});

function createCommonJSModule(url, exports) {
  // Snapshot the namespace values first
  const namedExports = Reflect.ownKeys(exports).filter((exportName) =>
    isValidIdentifier(exportName, false)
  );
  const ns = Object.create(null);
  ns.default = exports;
  for (const exportName of namedExports) {
    if (exportName === 'default')
      continue;
    try {
      ns[exportName] = exports[exportName];
    } catch {}
  }
  return createDynamicModule([...namedExports, 'default'], url, (reflect) => {
    for (const exportName in ns) {
      reflect.exports[exportName].set(ns[exportName]);
    }
  });
}

// Strategy for loading a node-style CommonJS module
translators.set('cjs', function(url, isMain) {
  debug(`Translating CJSModule ${url}`);
  const cached = this.cjsCache.get(url);
  if (cached) {
    this.cjsCache.delete(url);
    const modulePromise = (async () => createCommonJSModule(url, cached))();
    return { modulePromise };
  }
  let modulePromiseResolve;
  const modulePromise = new Promise(
    (resolve) => modulePromiseResolve = resolve
  );
  const preExec = () => {
    debug(`Executing CJSModule ${url}`);
    const module = CJSModule._load(fileURLToPath(url), undefined, isMain);
    modulePromiseResolve(createCommonJSModule(url, module));
  };
  return { preExec, modulePromise };
});

// Strategy for loading a node builtin CommonJS module that isn't
// through normal resolution
translators.set('builtin', function(url) {
  debug(`Translating BuiltinModule ${url}`);
  const modulePromise = (async () => {
    // slice 'node:' scheme
    const id = url.slice(5);
    NativeModule.require(id);
    const module = NativeModule.map.get(id);
    return createDynamicModule(
      [...module.exportKeys, 'default'], url, (reflect) => {
        debug(`Loading BuiltinModule ${url}`);
        module.reflect = reflect;
        for (const key of module.exportKeys)
          reflect.exports[key].set(module.exports[key]);
        reflect.exports.default.set(module.exports);
      });
  })();
  return { modulePromise };
});
