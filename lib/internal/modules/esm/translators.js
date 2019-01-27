'use strict';

const { NativeModule } = require('internal/bootstrap/loaders');
const { ModuleWrap, DynamicModuleWrap, callbackMap } = internalBinding('module_wrap');
const {
  stripShebang
} = require('internal/modules/cjs/helpers');
const CJSModule = require('internal/modules/cjs/loader');
const internalURLModule = require('internal/url');
const fs = require('fs');
const { SafeMap } = require('internal/safe_globals');
const { URL } = require('url');
const { debuglog, promisify } = require('util');
const esmLoader = require('internal/process/esm_loader');

const readFileAsync = promisify(fs.readFile);
const StringReplace = Function.call.bind(String.prototype.replace);

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
translators.set('esm', async function(url) {
  const source = `${await readFileAsync(new URL(url))}`;
  debug(`Translating StandardModule ${url}`);
  const module = new ModuleWrap(stripShebang(source), url);
  callbackMap.set(module, {
    initializeImportMeta,
    importModuleDynamically,
  });
  return module;
});

// Strategy for loading a node-style CommonJS module
const isWindows = process.platform === 'win32';
const winSepRegEx = /\//g;
translators.set('cjs', async function(url, isMain) {
  debug(`Translating CJSModule ${url}`);
  const pathname = internalURLModule.fileURLToPath(new URL(url));
  let module = this.cjsCache.get(url);
  if (!module) {
    const cjsModule = CJSModule._cache[
      isWindows ? StringReplace(pathname, winSepRegEx, '\\') : pathname];
    if (cjsModule && cjsModule.loaded)
      module = cjsModule.exports;
  }
  if (module) {
    this.cjsCache.delete(url);
    return new DynamicModuleWrap(url, (module) => {
      for (const exportName of Object.keys(cached)) {
        if (exportName === 'default') continue;
        let exportValue;
        try {
          exportValue = cached[exportName];
        }
        catch {
          continue;
        }
        module.setExport(exportName, exportValue);
      }
      module.setExport('default', cached);
    });
  }
  return new DynamicModuleWrap(url, (module) => {
    debug(`Loading CJSModule ${url}`);
    const exports = CJSModule._load(pathname, undefined, isMain);
    for (const exportName of Object.keys(exports)) {
      if (exportName === 'default') continue;
      let exportValue;
      try {
        exportValue = exports[exportName];
      }
      catch {
        continue;
      }
      module.setExport(exportName, exportValue);
    }
    module.setExport('default', exports);
  });
});

// Strategy for loading a node builtin CommonJS module that isn't
// through normal resolution
translators.set('builtin', async function(url) {
  debug(`Translating BuiltinModule ${url}`);
  // slice 'node:' scheme
  const id = url.slice(5);
  NativeModule.require(id);
  const module = NativeModule.map.get(id);
  return new DynamicModuleWrap(url, (module) => {
    debug(`Loading BuiltinModule ${url}`);
    for (const key of module.exportKeys)
      module.setExport(key, module.exports[key]);
    module.setExport('default', module.exports);
  });
});
