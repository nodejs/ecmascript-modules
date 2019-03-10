'use strict';

const { NativeModule } = require('internal/bootstrap/loaders');
const { ERR_TYPE_MISMATCH,
        ERR_UNKNOWN_FILE_EXTENSION } = require('internal/errors').codes;
const { resolve: moduleWrapResolve, setScopeType } =
    internalBinding('module_wrap');
const { pathToFileURL, fileURLToPath } = require('internal/url');
const asyncESM = require('internal/process/esm_loader');
const { getOptionValue } = require('internal/options');
const preserveSymlinks = getOptionValue('--preserve-symlinks');
const preserveSymlinksMain = getOptionValue('--preserve-symlinks-main');
const { extname, resolve: pathResolve } = require('path');
const { realpathSync } = require('fs');

const extensionFormatMap = {
  '__proto__': null,
  '.cjs': 'commonjs',
  '.js': 'module',
  '.mjs': 'module'
};

const legacyExtensionFormatMap = {
  '__proto__': null,
  '.cjs': 'commonjs',
  '.js': 'commonjs',
  '.json': 'commonjs',
  '.mjs': 'module',
  '.node': 'commonjs'
};

function resolve(specifier, parentURL) {
  if (NativeModule.canBeRequiredByUsers(specifier)) {
    return {
      url: specifier,
      format: 'builtin'
    };
  }

  const isMain = parentURL === undefined;
  if (isMain) {
    parentURL = pathToFileURL(`${process.cwd()}/`).href;

    if (asyncESM.typeFlag) {
      let entryPath = pathResolve(specifier);
      const ext = extname(entryPath);

      if (!preserveSymlinksMain) {
        try {
          entryPath = realpathSync(entryPath);
        } catch (e) {
          // Not found error will throw in main resolve.
          if (e.code !== 'ENOENT')
            throw e;
        }
      }

      // Conflict between explicit extension (.mjs, .cjs) and --type
      if (ext === '.cjs' && asyncESM.typeFlag === 'module' ||
          ext === '.mjs' && asyncESM.typeFlag === 'commonjs') {
        throw new ERR_TYPE_MISMATCH(
          entryPath, ext, asyncESM.typeFlag, 'extension');
      }

      // apply the --type flag scope
      const conflictErr =
          setScopeType(entryPath, asyncESM.typeFlag === 'commonjs');

      // Conflict between package scope type and --type
      if (conflictErr) {
        throw new ERR_TYPE_MISMATCH(
          entryPath, ext, asyncESM.typeFlag, 'scope');
      }
    }
  }

  const { url, legacy } =
      moduleWrapResolve(specifier, parentURL,
                        isMain ? !preserveSymlinksMain : !preserveSymlinks);

  const ext = extname(url.pathname);
  let format = (legacy ? legacyExtensionFormatMap : extensionFormatMap)[ext];

  if (!format) {
    if (isMain)
      format = legacy ? 'commonjs' : 'module';
    else
      throw new ERR_UNKNOWN_FILE_EXTENSION(fileURLToPath(url),
                                           fileURLToPath(parentURL));
  }

  return { url: `${url}`, format };
}

module.exports = resolve;
