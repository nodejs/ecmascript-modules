#ifndef SRC_INSPECTOR_AGENT_H_
#define SRC_INSPECTOR_AGENT_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <memory>

#include <stddef.h>

#if !HAVE_INSPECTOR
#error("This header can only be used when inspector is enabled")
#endif

#include "node_options.h"
#include "node_persistent.h"
#include "v8.h"

namespace v8_inspector {
class StringView;
}  // namespace v8_inspector

namespace node {
// Forward declaration to break recursive dependency chain with src/env.h.
class Environment;
struct ContextInfo;

namespace inspector {
class InspectorIo;
class ParentInspectorHandle;
class NodeInspectorClient;
class WorkerManager;

class InspectorSession {
 public:
  virtual ~InspectorSession() {}
  virtual void Dispatch(const v8_inspector::StringView& message) = 0;
};

class InspectorSessionDelegate {
 public:
  virtual ~InspectorSessionDelegate() = default;
  virtual void SendMessageToFrontend(const v8_inspector::StringView& message)
                                     = 0;
};

class Agent {
 public:
  explicit Agent(node::Environment* env);
  ~Agent();

  // Create client_, may create io_ if option enabled
  bool Start(const std::string& path,
             std::shared_ptr<DebugOptions> options,
             bool is_worker);
  // Stop and destroy io_
  void Stop();

  bool IsListening() { return io_ != nullptr; }
  // Returns true if the Node inspector is actually in use. It will be true
  // if either the user explicitly opted into inspector (e.g. with the
  // --inspect command line flag) or if inspector JS API had been used.
  bool IsActive();

  // Option is set to wait for session connection
  bool WillWaitForConnect();
  // Blocks till frontend connects and sends "runIfWaitingForDebugger"
  void WaitForConnect();
  // Blocks till all the sessions with "WaitForDisconnectOnShutdown" disconnect
  void WaitForDisconnect();
  void FatalException(v8::Local<v8::Value> error,
                      v8::Local<v8::Message> message);

  // Async stack traces instrumentation.
  void AsyncTaskScheduled(const v8_inspector::StringView& taskName, void* task,
                          bool recurring);
  void AsyncTaskCanceled(void* task);
  void AsyncTaskStarted(void* task);
  void AsyncTaskFinished(void* task);
  void AllAsyncTasksCanceled();

  void RegisterAsyncHook(v8::Isolate* isolate,
    v8::Local<v8::Function> enable_function,
    v8::Local<v8::Function> disable_function);
  void EnableAsyncHook();
  void DisableAsyncHook();

  void AddWorkerInspector(int thread_id, const std::string& url, Agent* agent);

  // Called to create inspector sessions that can be used from the main thread.
  // The inspector responds by using the delegate to send messages back.
  std::unique_ptr<InspectorSession> Connect(
      std::unique_ptr<InspectorSessionDelegate> delegate,
      bool prevent_shutdown);

  void PauseOnNextJavascriptStatement(const std::string& reason);

  InspectorIo* io() {
    return io_.get();
  }

  // Can only be called from the main thread.
  bool StartIoThread();

  // Calls StartIoThread() from off the main thread.
  void RequestIoThreadStart();

  std::shared_ptr<DebugOptions> options() { return debug_options_; }
  void ContextCreated(v8::Local<v8::Context> context, const ContextInfo& info);

  // Interface for interacting with inspectors in worker threads
  std::shared_ptr<WorkerManager> GetWorkerManager();

 private:
  void ToggleAsyncHook(v8::Isolate* isolate,
                       const node::Persistent<v8::Function>& fn);

  node::Environment* parent_env_;
  // Encapsulates majority of the Inspector functionality
  std::shared_ptr<NodeInspectorClient> client_;
  // Interface for transports, e.g. WebSocket server
  std::unique_ptr<InspectorIo> io_;
  std::unique_ptr<ParentInspectorHandle> parent_handle_;
  std::string path_;
  std::shared_ptr<DebugOptions> debug_options_;

  bool pending_enable_async_hook_ = false;
  bool pending_disable_async_hook_ = false;
  node::Persistent<v8::Function> enable_async_hook_function_;
  node::Persistent<v8::Function> disable_async_hook_function_;
};

}  // namespace inspector
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_INSPECTOR_AGENT_H_
