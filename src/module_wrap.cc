#include <algorithm>
#include <limits.h>  // PATH_MAX
#include <sys/stat.h>  // S_IFDIR
#include "module_wrap.h"

#include "env.h"
#include "node_errors.h"
#include "node_url.h"
#include "util-inl.h"
#include "node_contextify.h"
#include "node_watchdog.h"

namespace node {
namespace loader {

using errors::TryCatchScope;

using node::contextify::ContextifyContext;
using node::url::URL;
using node::url::URL_FLAGS_FAILED;
using v8::Array;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::HandleScope;
using v8::Integer;
using v8::IntegrityLevel;
using v8::Isolate;
using v8::Just;
using v8::Local;
using v8::Maybe;
using v8::MaybeLocal;
using v8::Module;
using v8::Nothing;
using v8::Number;
using v8::Object;
using v8::PrimitiveArray;
using v8::Promise;
using v8::ScriptCompiler;
using v8::ScriptOrigin;
using v8::String;
using v8::Undefined;
using v8::Value;

ModuleWrap::ModuleWrap(Environment* env,
                       Local<Object> object,
                       Local<Module> module,
                       Local<String> url) :
  BaseObject(env, object),
  id_(env->get_next_module_id()) {
  module_.Reset(env->isolate(), module);
  url_.Reset(env->isolate(), url);
  env->id_to_module_map.emplace(id_, this);
}

ModuleWrap::~ModuleWrap() {
  HandleScope scope(env()->isolate());
  Local<Module> module = module_.Get(env()->isolate());
  env()->id_to_module_map.erase(id_);
  auto range = env()->hash_to_module_map.equal_range(module->GetIdentityHash());
  for (auto it = range.first; it != range.second; ++it) {
    if (it->second == this) {
      env()->hash_to_module_map.erase(it);
      break;
    }
  }
}

ModuleWrap* ModuleWrap::GetFromModule(Environment* env,
                                      Local<Module> module) {
  auto range = env->hash_to_module_map.equal_range(module->GetIdentityHash());
  for (auto it = range.first; it != range.second; ++it) {
    if (it->second->module_ == module) {
      return it->second;
    }
  }
  return nullptr;
}

ModuleWrap* ModuleWrap::GetFromID(Environment* env, uint32_t id) {
  auto module_wrap_it = env->id_to_module_map.find(id);
  if (module_wrap_it == env->id_to_module_map.end()) {
    return nullptr;
  }
  return module_wrap_it->second;
}

void ModuleWrap::New(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = env->isolate();

  CHECK(args.IsConstructCall());
  Local<Object> that = args.This();

  const int argc = args.Length();
  CHECK_GE(argc, 2);

  CHECK(args[0]->IsString());
  Local<String> source_text = args[0].As<String>();

  CHECK(args[1]->IsString());
  Local<String> url = args[1].As<String>();

  Local<Context> context;
  Local<Integer> line_offset;
  Local<Integer> column_offset;

  if (argc == 5) {
    // new ModuleWrap(source, url, context?, lineOffset, columnOffset)
    if (args[2]->IsUndefined()) {
      context = that->CreationContext();
    } else {
      CHECK(args[2]->IsObject());
      ContextifyContext* sandbox =
          ContextifyContext::ContextFromContextifiedSandbox(
              env, args[2].As<Object>());
      CHECK_NOT_NULL(sandbox);
      context = sandbox->context();
    }

    CHECK(args[3]->IsNumber());
    line_offset = args[3].As<Integer>();

    CHECK(args[4]->IsNumber());
    column_offset = args[4].As<Integer>();
  } else {
    // new ModuleWrap(source, url)
    context = that->CreationContext();
    line_offset = Integer::New(isolate, 0);
    column_offset = Integer::New(isolate, 0);
  }

  Environment::ShouldNotAbortOnUncaughtScope no_abort_scope(env);
  TryCatchScope try_catch(env);
  Local<Module> module;

  Local<PrimitiveArray> host_defined_options =
      PrimitiveArray::New(isolate, HostDefinedOptions::kLength);
  host_defined_options->Set(isolate, HostDefinedOptions::kType,
                            Number::New(isolate, ScriptType::kModule));

  // compile
  {
    ScriptOrigin origin(url,
                        line_offset,                          // line offset
                        column_offset,                        // column offset
                        True(isolate),                        // is cross origin
                        Local<Integer>(),                     // script id
                        Local<Value>(),                       // source map URL
                        False(isolate),                       // is opaque (?)
                        False(isolate),                       // is WASM
                        True(isolate),                        // is ES Module
                        host_defined_options);
    Context::Scope context_scope(context);
    ScriptCompiler::Source source(source_text, origin);
    if (!ScriptCompiler::CompileModule(isolate, &source).ToLocal(&module)) {
      CHECK(try_catch.HasCaught());
      CHECK(!try_catch.Message().IsEmpty());
      CHECK(!try_catch.Exception().IsEmpty());
      AppendExceptionLine(env, try_catch.Exception(), try_catch.Message(),
                          ErrorHandlingMode::MODULE_ERROR);
      try_catch.ReThrow();
      return;
    }
  }

  if (!that->Set(context, env->url_string(), url).FromMaybe(false)) {
    return;
  }

  ModuleWrap* obj = new ModuleWrap(env, that, module, url);
  obj->context_.Reset(isolate, context);

  env->hash_to_module_map.emplace(module->GetIdentityHash(), obj);

  host_defined_options->Set(isolate, HostDefinedOptions::kID,
                            Number::New(isolate, obj->id()));

  that->SetIntegrityLevel(context, IntegrityLevel::kFrozen);
  args.GetReturnValue().Set(that);
}

void ModuleWrap::Link(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = args.GetIsolate();

  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());

  Local<Object> that = args.This();

  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, that);

  if (obj->linked_)
    return;
  obj->linked_ = true;

  Local<Function> resolver_arg = args[0].As<Function>();

  Local<Context> mod_context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);

  Local<Array> promises = Array::New(isolate,
                                     module->GetModuleRequestsLength());

  // call the dependency resolve callbacks
  for (int i = 0; i < module->GetModuleRequestsLength(); i++) {
    Local<String> specifier = module->GetModuleRequest(i);
    Utf8Value specifier_utf8(env->isolate(), specifier);
    std::string specifier_std(*specifier_utf8, specifier_utf8.length());

    Local<Value> argv[] = {
      specifier
    };

    MaybeLocal<Value> maybe_resolve_return_value =
        resolver_arg->Call(mod_context, that, 1, argv);
    if (maybe_resolve_return_value.IsEmpty()) {
      return;
    }
    Local<Value> resolve_return_value =
        maybe_resolve_return_value.ToLocalChecked();
    if (!resolve_return_value->IsPromise()) {
      env->ThrowError("linking error, expected resolver to return a promise");
    }
    Local<Promise> resolve_promise = resolve_return_value.As<Promise>();
    obj->resolve_cache_[specifier_std].Reset(env->isolate(), resolve_promise);

    promises->Set(mod_context, i, resolve_promise).FromJust();
  }

  args.GetReturnValue().Set(promises);
}

void ModuleWrap::Instantiate(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);
  TryCatchScope try_catch(env);
  Maybe<bool> ok = module->InstantiateModule(context, ResolveCallback);

  // clear resolve cache on instantiate
  obj->resolve_cache_.clear();

  if (!ok.FromMaybe(false)) {
    CHECK(try_catch.HasCaught());
    CHECK(!try_catch.Message().IsEmpty());
    CHECK(!try_catch.Exception().IsEmpty());
    AppendExceptionLine(env, try_catch.Exception(), try_catch.Message(),
                        ErrorHandlingMode::MODULE_ERROR);
    try_catch.ReThrow();
    return;
  }
}

void ModuleWrap::Evaluate(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = env->isolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);

  // module.evaluate(timeout, breakOnSigint)
  CHECK_EQ(args.Length(), 2);

  CHECK(args[0]->IsNumber());
  int64_t timeout = args[0]->IntegerValue(env->context()).FromJust();

  CHECK(args[1]->IsBoolean());
  bool break_on_sigint = args[1]->IsTrue();

  Environment::ShouldNotAbortOnUncaughtScope no_abort_scope(env);
  TryCatchScope try_catch(env);

  bool timed_out = false;
  bool received_signal = false;
  MaybeLocal<Value> result;
  if (break_on_sigint && timeout != -1) {
    Watchdog wd(isolate, timeout, &timed_out);
    SigintWatchdog swd(isolate, &received_signal);
    result = module->Evaluate(context);
  } else if (break_on_sigint) {
    SigintWatchdog swd(isolate, &received_signal);
    result = module->Evaluate(context);
  } else if (timeout != -1) {
    Watchdog wd(isolate, timeout, &timed_out);
    result = module->Evaluate(context);
  } else {
    result = module->Evaluate(context);
  }

  // Convert the termination exception into a regular exception.
  if (timed_out || received_signal) {
    env->isolate()->CancelTerminateExecution();
    // It is possible that execution was terminated by another timeout in
    // which this timeout is nested, so check whether one of the watchdogs
    // from this invocation is responsible for termination.
    if (timed_out) {
      THROW_ERR_SCRIPT_EXECUTION_TIMEOUT(env, timeout);
    } else if (received_signal) {
      THROW_ERR_SCRIPT_EXECUTION_INTERRUPTED(env);
    }
  }

  if (try_catch.HasCaught()) {
    try_catch.ReThrow();
    return;
  }

  args.GetReturnValue().Set(result.ToLocalChecked());
}

void ModuleWrap::Namespace(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  switch (module->GetStatus()) {
    default:
      return env->ThrowError(
          "cannot get namespace, Module has not been instantiated");
    case v8::Module::Status::kInstantiated:
    case v8::Module::Status::kEvaluating:
    case v8::Module::Status::kEvaluated:
      break;
  }

  Local<Value> result = module->GetModuleNamespace();
  args.GetReturnValue().Set(result);
}

void ModuleWrap::GetStatus(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  args.GetReturnValue().Set(module->GetStatus());
}

void ModuleWrap::GetStaticDependencySpecifiers(
    const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(env->isolate());

  int count = module->GetModuleRequestsLength();

  Local<Array> specifiers = Array::New(env->isolate(), count);

  for (int i = 0; i < count; i++)
    specifiers->Set(env->context(), i, module->GetModuleRequest(i)).FromJust();

  args.GetReturnValue().Set(specifiers);
}

void ModuleWrap::GetError(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  args.GetReturnValue().Set(module->GetException());
}

MaybeLocal<Module> ModuleWrap::ResolveCallback(Local<Context> context,
                                               Local<String> specifier,
                                               Local<Module> referrer) {
  Environment* env = Environment::GetCurrent(context);
  CHECK_NOT_NULL(env);  // TODO(addaleax): Handle nullptr here.
  Isolate* isolate = env->isolate();

  ModuleWrap* dependent = GetFromModule(env, referrer);
  if (dependent == nullptr) {
    env->ThrowError("linking error, null dep");
    return MaybeLocal<Module>();
  }

  Utf8Value specifier_utf8(isolate, specifier);
  std::string specifier_std(*specifier_utf8, specifier_utf8.length());

  if (dependent->resolve_cache_.count(specifier_std) != 1) {
    env->ThrowError("linking error, not in local cache");
    return MaybeLocal<Module>();
  }

  Local<Promise> resolve_promise =
      dependent->resolve_cache_[specifier_std].Get(isolate);

  if (resolve_promise->State() != Promise::kFulfilled) {
    env->ThrowError("linking error, dependency promises must be resolved on "
                    "instantiate");
    return MaybeLocal<Module>();
  }

  Local<Object> module_object = resolve_promise->Result().As<Object>();
  if (module_object.IsEmpty() || !module_object->IsObject()) {
    env->ThrowError("linking error, expected a valid module object from "
                    "resolver");
    return MaybeLocal<Module>();
  }

  ModuleWrap* module;
  ASSIGN_OR_RETURN_UNWRAP(&module, module_object, MaybeLocal<Module>());
  return module->module_.Get(isolate);
}

namespace {

// Tests whether a path starts with /, ./ or ../
// In WhatWG terminology, the alternative case is called a "bare" specifier
// (e.g. in `import "jquery"`).
inline bool ShouldBeTreatedAsRelativeOrAbsolutePath(
    const std::string& specifier) {
  size_t len = specifier.length();
  if (len == 0)
    return false;
  if (specifier[0] == '/') {
    return true;
  } else if (specifier[0] == '.') {
    if (len == 1 || specifier[1] == '/')
      return true;
    if (specifier[1] == '.') {
      if (len == 2 || specifier[2] == '/')
        return true;
    }
  }
  return false;
}

std::string ReadFile(uv_file file) {
  std::string contents;
  uv_fs_t req;
  char buffer_memory[4096];
  uv_buf_t buf = uv_buf_init(buffer_memory, sizeof(buffer_memory));

  do {
    const int r = uv_fs_read(uv_default_loop(),
                             &req,
                             file,
                             &buf,
                             1,
                             contents.length(),  // offset
                             nullptr);
    uv_fs_req_cleanup(&req);

    if (r <= 0)
      break;
    contents.append(buf.base, r);
  } while (true);
  return contents;
}

enum DescriptorType {
  FILE,
  DIRECTORY,
  NONE
};

// When DescriptorType cache is added, this can also return
// Nothing for the "null" cache entries.
inline Maybe<uv_file> OpenDescriptor(const std::string& path) {
  uv_fs_t fs_req;
  uv_file fd = uv_fs_open(nullptr, &fs_req, path.c_str(), O_RDONLY, 0, nullptr);
  uv_fs_req_cleanup(&fs_req);
  if (fd < 0) return Nothing<uv_file>();
  return Just(fd);
}

inline void CloseDescriptor(uv_file fd) {
  uv_fs_t fs_req;
  uv_fs_close(nullptr, &fs_req, fd, nullptr);
  uv_fs_req_cleanup(&fs_req);
}

inline DescriptorType CheckDescriptorAtFile(uv_file fd) {
  uv_fs_t fs_req;
  int rc = uv_fs_fstat(nullptr, &fs_req, fd, nullptr);
  if (rc == 0) {
    uint64_t is_directory = fs_req.statbuf.st_mode & S_IFDIR;
    uv_fs_req_cleanup(&fs_req);
    return is_directory ? DIRECTORY : FILE;
  }
  uv_fs_req_cleanup(&fs_req);
  return NONE;
}

// TODO(@guybedford): Add a DescriptorType cache layer here.
// Should be directory based -> if path/to/dir doesn't exist
// then the cache should early-fail any path/to/dir/file check.
DescriptorType CheckDescriptorAtPath(const std::string& path) {
  Maybe<uv_file> fd = OpenDescriptor(path);
  if (fd.IsNothing()) return NONE;
  DescriptorType type = CheckDescriptorAtFile(fd.FromJust());
  CloseDescriptor(fd.FromJust());
  return type;
}

Maybe<std::string> ReadIfFile(const std::string& path) {
  Maybe<uv_file> fd = OpenDescriptor(path);
  if (fd.IsNothing()) return Nothing<std::string>();
  DescriptorType type = CheckDescriptorAtFile(fd.FromJust());
  if (type != FILE) return Nothing<std::string>();
  std::string source = ReadFile(fd.FromJust());
  CloseDescriptor(fd.FromJust());
  return Just(source);
}

using Exists = PackageConfig::Exists;
using IsValid = PackageConfig::IsValid;
using HasMain = PackageConfig::HasMain;
using IsESM = PackageConfig::IsESM;

Maybe<const PackageConfig*> GetPackageConfig(Environment* env,
                                             const std::string& path,
                                             const URL& base) {
  auto existing = env->package_json_cache.find(path);
  if (existing != env->package_json_cache.end()) {
    return Just(&existing->second);
  }

  Maybe<std::string> source = ReadIfFile(path);

  if (source.IsNothing()) {
    auto entry = env->package_json_cache.emplace(path,
        PackageConfig { Exists::No, IsValid::Yes, HasMain::No, "",
                        IsESM::No });
    return Just(&entry.first->second);
  }

  std::string pkg_src = source.FromJust();

  Isolate* isolate = env->isolate();
  v8::HandleScope handle_scope(isolate);

  bool parsed = false;
  Local<Object> pkg_json;
  {
    Local<String> src;
    Local<Value> pkg_json_v;
    if (String::NewFromUtf8(isolate,
                            pkg_src.c_str(),
                            v8::NewStringType::kNormal,
                            pkg_src.length()).ToLocal(&src) &&
        v8::JSON::Parse(env->context(), src).ToLocal(&pkg_json_v) &&
        pkg_json_v->ToObject(env->context()).ToLocal(&pkg_json)) {
      parsed = true;
    }
  }

  if (!parsed) {
    (void)env->package_json_cache.emplace(path,
        PackageConfig { Exists::Yes, IsValid::No, HasMain::No, "",
                        IsESM::No });
    std::string msg = "Invalid JSON in '" + path +
        "' imported from " + base.ToFilePath();
    node::THROW_ERR_INVALID_PACKAGE_CONFIG(env, msg.c_str());
    return Nothing<const PackageConfig*>();
  }

  Local<Value> pkg_main;
  HasMain::Bool has_main = HasMain::No;
  std::string main_std;
  if (pkg_json->Get(env->context(), env->main_string()).ToLocal(&pkg_main)) {
    if (pkg_main->IsString()) {
      has_main = HasMain::Yes;
    }
    Utf8Value main_utf8(isolate, pkg_main);
    main_std.assign(std::string(*main_utf8, main_utf8.length()));
  }

  IsESM::Bool esm = IsESM::No;
  Local<Value> type_v;
  if (pkg_json->Get(env->context(), env->type_string()).ToLocal(&type_v)) {
    if (type_v->StrictEquals(env->module_string())) {
      esm = IsESM::Yes;
    }
  }

  Local<Value> exports_v;
  if (pkg_json->Get(env->context(),
      env->exports_string()).ToLocal(&exports_v) &&
      (exports_v->IsObject() || exports_v->IsString() ||
      exports_v->IsBoolean())) {
    Persistent<Value> exports;
    // esm = IsESM::Yes;
    exports.Reset(env->isolate(), exports_v);

    auto entry = env->package_json_cache.emplace(path,
        PackageConfig { Exists::Yes, IsValid::Yes, has_main, main_std,
                        esm });
    return Just(&entry.first->second);
  }

  auto entry = env->package_json_cache.emplace(path,
      PackageConfig { Exists::Yes, IsValid::Yes, has_main, main_std,
                      esm });
  return Just(&entry.first->second);
}

Maybe<const PackageConfig*> GetPackageBoundaryConfig(Environment* env,
                                                     const URL& search,
                                                     const URL& base) {
  URL pjson_url("package.json", &search);
  while (true) {
    Maybe<const PackageConfig*> pkg_cfg =
        GetPackageConfig(env, pjson_url.ToFilePath(), base);
    if (pkg_cfg.IsNothing()) return pkg_cfg;
    if (pkg_cfg.FromJust()->exists == Exists::Yes) return pkg_cfg;

    URL last_pjson_url = pjson_url;
    pjson_url = URL("../package.json", pjson_url);

    // Terminates at root where ../package.json equals ../../package.json
    // (can't just check "/package.json" for Windows support).
    if (pjson_url.path() == last_pjson_url.path()) {
      auto entry = env->package_json_cache.emplace(pjson_url.ToFilePath(),
          PackageConfig { Exists::No, IsValid::Yes, HasMain::No, "",
                          IsESM::No });
      return Just(&entry.first->second);
    }
  }
}

/*
 * Legacy CommonJS main resolution:
 * 1. let M = pkg_url + (json main field)
 * 2. TRY(M, M.js, M.json, M.node)
 * 3. TRY(M/index.js, M/index.json, M/index.node)
 * 4. TRY(pkg_url/index.js, pkg_url/index.json, pkg_url/index.node)
 * 5. NOT_FOUND
 */
inline bool FileExists(const URL& url) {
  return CheckDescriptorAtPath(url.ToFilePath()) == FILE;
}
Maybe<URL> LegacyMainResolve(const URL& pjson_url,
                             const PackageConfig& pcfg) {
  URL guess;
  if (pcfg.has_main == HasMain::Yes) {
    // Note: fs check redundances will be handled by Descriptor cache here.
    if (FileExists(guess = URL("./" + pcfg.main, pjson_url))) {
      return Just(guess);
    }
    if (FileExists(guess = URL("./" + pcfg.main + ".js", pjson_url))) {
      return Just(guess);
    }
    if (FileExists(guess = URL("./" + pcfg.main + ".json", pjson_url))) {
      return Just(guess);
    }
    if (FileExists(guess = URL("./" + pcfg.main + ".node", pjson_url))) {
      return Just(guess);
    }
    if (FileExists(guess = URL("./" + pcfg.main + "/index.js", pjson_url))) {
      return Just(guess);
    }
    // Such stat.
    if (FileExists(guess = URL("./" + pcfg.main + "/index.json", pjson_url))) {
      return Just(guess);
    }
    if (FileExists(guess = URL("./" + pcfg.main + "/index.node", pjson_url))) {
      return Just(guess);
    }
    // Fallthrough.
  }
  if (FileExists(guess = URL("./index.js", pjson_url))) {
    return Just(guess);
  }
  // So fs.
  if (FileExists(guess = URL("./index.json", pjson_url))) {
    return Just(guess);
  }
  if (FileExists(guess = URL("./index.node", pjson_url))) {
    return Just(guess);
  }
  // Not found.
  return Nothing<URL>();
}

Maybe<ModuleResolution> FinalizeResolution(Environment* env,
                                           const URL& resolved,
                                           const URL& base,
                                           bool check_exists) {
  const std::string& path = resolved.ToFilePath();

  if (check_exists && CheckDescriptorAtPath(path) != FILE) {
    std::string msg = "Cannot find module '" + path +
        "' imported from " + base.ToFilePath();
    node::THROW_ERR_MODULE_NOT_FOUND(env, msg.c_str());
    return Nothing<ModuleResolution>();
  }

  Maybe<const PackageConfig*> pcfg =
      GetPackageBoundaryConfig(env, resolved, base);
  if (pcfg.IsNothing()) return Nothing<ModuleResolution>();

  if (pcfg.FromJust()->exists == Exists::No) {
    return Just(ModuleResolution { resolved, true });
  }

  return Just(ModuleResolution {
      resolved, pcfg.FromJust()->esm == IsESM::No });
}

Maybe<ModuleResolution> FinalizeResolutionMain(Environment* env,
                                               const URL& resolved,
                                               const URL& base,
                                               bool esm_flag) {
  const std::string& path = resolved.ToFilePath();

  if (CheckDescriptorAtPath(path) != FILE) {
    std::string msg = "Cannot find module '" + path +
        "' imported from " + base.ToFilePath();
    node::THROW_ERR_MODULE_NOT_FOUND(env, msg.c_str());
    return Nothing<ModuleResolution>();
  }

  if (esm_flag) {
    return Just(ModuleResolution { resolved, false });
  }

  Maybe<const PackageConfig*> pcfg =
      GetPackageBoundaryConfig(env, resolved, base);
  if (pcfg.IsNothing()) return Nothing<ModuleResolution>();

  if (pcfg.FromJust()->exists == Exists::No) {
    return Just(ModuleResolution { resolved, true });
  }

  return Just(ModuleResolution {
      resolved, pcfg.FromJust()->esm == IsESM::No });
}

Maybe<ModuleResolution> PackageMainResolve(Environment* env,
                                           const URL& pjson_url,
                                           const PackageConfig& pcfg,
                                           const URL& base) {
  if (pcfg.exists == Exists::No || (
      pcfg.esm == IsESM::Yes && pcfg.has_main == HasMain::No)) {
    std::string msg = "Cannot find main entry point for '" +
        URL(".", pjson_url).ToFilePath() + "' imported from " +
        base.ToFilePath();
    node::THROW_ERR_MODULE_NOT_FOUND(env, msg.c_str());
    return Nothing<ModuleResolution>();
  }
  if (pcfg.has_main == HasMain::Yes &&
      pcfg.main.substr(pcfg.main.length() - 4, 4) == ".mjs") {
    return FinalizeResolution(env, URL(pcfg.main, pjson_url), base, true);
  }
  if (pcfg.esm == IsESM::Yes &&
      pcfg.main.substr(pcfg.main.length() - 3, 3) == ".js") {
    return FinalizeResolution(env, URL(pcfg.main, pjson_url), base, true);
  }

  Maybe<URL> resolved = LegacyMainResolve(pjson_url, pcfg);
  // Legacy main resolution error
  if (resolved.IsNothing()) {
    return Nothing<ModuleResolution>();
  }
  return FinalizeResolution(env, resolved.FromJust(), base, false);
}

Maybe<ModuleResolution> PackageResolve(Environment* env,
                          const std::string& specifier,
                          const URL& base) {
  size_t sep_index = specifier.find('/');
  if (specifier[0] == '@' && (sep_index == std::string::npos ||
      specifier.length() == 0)) {
    std::string msg = "Invalid package name '" + specifier +
      "' imported from " + base.ToFilePath();
    node::THROW_ERR_INVALID_MODULE_SPECIFIER(env, msg.c_str());
    return Nothing<ModuleResolution>();
  }
  bool scope = false;
  if (specifier[0] == '@') {
    scope = true;
    sep_index = specifier.find('/', sep_index + 1);
  }
  std::string pkg_name = specifier.substr(0,
      sep_index == std::string::npos ? std::string::npos : sep_index);
  std::string pkg_subpath;
  if ((sep_index == std::string::npos ||
      sep_index == specifier.length() - 1)) {
    pkg_subpath = "";
  } else {
    pkg_subpath = "." + specifier.substr(sep_index);
  }
  URL pjson_url("./node_modules/" + pkg_name + "/package.json", &base);
  std::string pjson_path = pjson_url.ToFilePath();
  std::string last_path;
  do {
    DescriptorType check =
        CheckDescriptorAtPath(pjson_path.substr(0, pjson_path.length() - 13));
    if (check != DIRECTORY) {
      last_path = pjson_path;
      pjson_url = URL((scope ?
          "../../../../node_modules/" : "../../../node_modules/") +
          pkg_name + "/package.json", &pjson_url);
      pjson_path = pjson_url.ToFilePath();
      continue;
    }

    // Package match.
    Maybe<const PackageConfig*> pcfg = GetPackageConfig(env, pjson_path, base);
    // Invalid package configuration error.
    if (pcfg.IsNothing()) return Nothing<ModuleResolution>();
    if (!pkg_subpath.length()) {
      return PackageMainResolve(env, pjson_url, *pcfg.FromJust(), base);
    } else {
      return FinalizeResolution(env, URL(pkg_subpath, pjson_url), base, true);
    }
    CHECK(false);
    // Cross-platform root check.
  } while (pjson_path.length() != last_path.length());

  std::string msg = "Cannot find package '" + pkg_name +
      "' imported from " + base.ToFilePath();
  node::THROW_ERR_MODULE_NOT_FOUND(env, msg.c_str());
  return Nothing<ModuleResolution>();
}

}  // anonymous namespace

Maybe<ModuleResolution> Resolve(Environment* env,
                                const std::string& specifier,
                                const URL& base,
                                bool is_main,
                                bool esm_flag) {
  // Order swapped from spec for minor perf gain.
  // Ok since relative URLs cannot parse as URLs.
  URL resolved;
  if (ShouldBeTreatedAsRelativeOrAbsolutePath(specifier)) {
    resolved = URL(specifier, base);
  } else {
    URL pure_url(specifier);
    if (!(pure_url.flags() & URL_FLAGS_FAILED)) {
      resolved = pure_url;
    } else {
      return PackageResolve(env, specifier, base);
    }
  }
  if (is_main)
    return FinalizeResolutionMain(env, resolved, base, esm_flag);
  else
    return FinalizeResolution(env, resolved, base, true);
}

void ModuleWrap::Resolve(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  // module.resolve(specifier, url, is_main, esm_flag)
  CHECK_EQ(args.Length(), 4);

  CHECK(args[0]->IsString());
  Utf8Value specifier_utf8(env->isolate(), args[0]);
  std::string specifier_std(*specifier_utf8, specifier_utf8.length());

  CHECK(args[1]->IsString());
  Utf8Value url_utf8(env->isolate(), args[1]);
  URL url(*url_utf8, url_utf8.length());

  CHECK(args[2]->IsBoolean());

  CHECK(args[3]->IsBoolean());

  if (url.flags() & URL_FLAGS_FAILED) {
    return node::THROW_ERR_INVALID_ARG_TYPE(
        env, "second argument is not a URL string");
  }

  TryCatchScope try_catch(env);
  Maybe<ModuleResolution> result =
      node::loader::Resolve(env,
                            specifier_std,
                            url,
                            args[2]->IsTrue(),
                            args[3]->IsTrue());
  if (result.IsNothing()) {
    CHECK(try_catch.HasCaught());
    try_catch.ReThrow();
    return;
  }
  CHECK(!try_catch.HasCaught());

  ModuleResolution resolution = result.FromJust();
  CHECK(!(resolution.url.flags() & URL_FLAGS_FAILED));

  Local<Object> resolved = Object::New(env->isolate());

  resolved->DefineOwnProperty(
      env->context(),
      env->url_string(),
      resolution.url.ToObject(env).ToLocalChecked(),
      v8::ReadOnly).FromJust();

  resolved->DefineOwnProperty(
      env->context(),
      env->legacy_string(),
      v8::Boolean::New(env->isolate(), resolution.legacy),
      v8::ReadOnly).FromJust();

    args.GetReturnValue().Set(resolved);
}

static MaybeLocal<Promise> ImportModuleDynamically(
    Local<Context> context,
    Local<v8::ScriptOrModule> referrer,
    Local<String> specifier) {
  Isolate* iso = context->GetIsolate();
  Environment* env = Environment::GetCurrent(context);
  CHECK_NOT_NULL(env);  // TODO(addaleax): Handle nullptr here.
  v8::EscapableHandleScope handle_scope(iso);

  Local<Function> import_callback =
    env->host_import_module_dynamically_callback();

  Local<PrimitiveArray> options = referrer->GetHostDefinedOptions();
  if (options->Length() != HostDefinedOptions::kLength) {
    Local<Promise::Resolver> resolver =
        Promise::Resolver::New(context).ToLocalChecked();
    resolver
        ->Reject(context,
                 v8::Exception::TypeError(FIXED_ONE_BYTE_STRING(
                     context->GetIsolate(), "Invalid host defined options")))
        .ToChecked();
    return handle_scope.Escape(resolver->GetPromise());
  }

  Local<Value> object;

  int type = options->Get(iso, HostDefinedOptions::kType)
                 .As<Number>()
                 ->Int32Value(context)
                 .ToChecked();
  uint32_t id = options->Get(iso, HostDefinedOptions::kID)
                    .As<Number>()
                    ->Uint32Value(context)
                    .ToChecked();
  if (type == ScriptType::kScript) {
    contextify::ContextifyScript* wrap = env->id_to_script_map.find(id)->second;
    object = wrap->object();
  } else if (type == ScriptType::kModule) {
    ModuleWrap* wrap = ModuleWrap::GetFromID(env, id);
    object = wrap->object();
  } else {
    UNREACHABLE();
  }

  Local<Value> import_args[] = {
    object,
    Local<Value>(specifier),
  };

  Local<Value> result;
  if (import_callback->Call(
        context,
        v8::Undefined(iso),
        arraysize(import_args),
        import_args).ToLocal(&result)) {
    CHECK(result->IsPromise());
    return handle_scope.Escape(result.As<Promise>());
  }

  return MaybeLocal<Promise>();
}

void ModuleWrap::SetImportModuleDynamicallyCallback(
    const FunctionCallbackInfo<Value>& args) {
  Isolate* iso = args.GetIsolate();
  Environment* env = Environment::GetCurrent(args);
  HandleScope handle_scope(iso);

  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());
  Local<Function> import_callback = args[0].As<Function>();
  env->set_host_import_module_dynamically_callback(import_callback);

  iso->SetHostImportModuleDynamicallyCallback(ImportModuleDynamically);
}

void ModuleWrap::HostInitializeImportMetaObjectCallback(
    Local<Context> context, Local<Module> module, Local<Object> meta) {
  Environment* env = Environment::GetCurrent(context);
  CHECK_NOT_NULL(env);  // TODO(addaleax): Handle nullptr here.
  ModuleWrap* module_wrap = GetFromModule(env, module);

  if (module_wrap == nullptr) {
    return;
  }

  Local<Object> wrap = module_wrap->object();
  Local<Function> callback =
      env->host_initialize_import_meta_object_callback();
  Local<Value> args[] = { wrap, meta };
  callback->Call(context, Undefined(env->isolate()), arraysize(args), args)
      .ToLocalChecked();
}

void ModuleWrap::SetInitializeImportMetaObjectCallback(
    const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = env->isolate();

  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());
  Local<Function> import_meta_callback = args[0].As<Function>();
  env->set_host_initialize_import_meta_object_callback(import_meta_callback);

  isolate->SetHostInitializeImportMetaObjectCallback(
      HostInitializeImportMetaObjectCallback);
}

void ModuleWrap::Initialize(Local<Object> target,
                            Local<Value> unused,
                            Local<Context> context,
                            void* priv) {
  Environment* env = Environment::GetCurrent(context);
  Isolate* isolate = env->isolate();

  Local<FunctionTemplate> tpl = env->NewFunctionTemplate(New);
  tpl->SetClassName(FIXED_ONE_BYTE_STRING(isolate, "ModuleWrap"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  env->SetProtoMethod(tpl, "link", Link);
  env->SetProtoMethod(tpl, "instantiate", Instantiate);
  env->SetProtoMethod(tpl, "evaluate", Evaluate);
  env->SetProtoMethodNoSideEffect(tpl, "namespace", Namespace);
  env->SetProtoMethodNoSideEffect(tpl, "getStatus", GetStatus);
  env->SetProtoMethodNoSideEffect(tpl, "getError", GetError);
  env->SetProtoMethodNoSideEffect(tpl, "getStaticDependencySpecifiers",
                                  GetStaticDependencySpecifiers);

  target->Set(env->context(), FIXED_ONE_BYTE_STRING(isolate, "ModuleWrap"),
              tpl->GetFunction(context).ToLocalChecked()).FromJust();
  env->SetMethod(target, "resolve", Resolve);
  env->SetMethod(target,
                 "setImportModuleDynamicallyCallback",
                 SetImportModuleDynamicallyCallback);
  env->SetMethod(target,
                 "setInitializeImportMetaObjectCallback",
                 SetInitializeImportMetaObjectCallback);

#define V(name)                                                                \
    target->Set(context,                                                       \
      FIXED_ONE_BYTE_STRING(env->isolate(), #name),                            \
      Integer::New(env->isolate(), Module::Status::name))                      \
        .FromJust()
    V(kUninstantiated);
    V(kInstantiating);
    V(kInstantiated);
    V(kEvaluating);
    V(kEvaluated);
    V(kErrored);
#undef V
}

}  // namespace loader
}  // namespace node

NODE_MODULE_CONTEXT_AWARE_INTERNAL(module_wrap,
                                   node::loader::ModuleWrap::Initialize)
