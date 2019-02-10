'use strict';

const { ModuleWrap } = internalBinding('module_wrap');
const {
  SafeSet,
  SafePromise
} = primordials;

const { decorateErrorStack } = require('internal/util');
const assert = require('internal/assert');
const resolvedPromise = SafePromise.resolve();

function noop() {}

/* A ModuleJob tracks the loading of a single Module, and the ModuleJobs of
 * its dependencies, over time. */
class ModuleJob {
  // `loader` is the Loader instance used for loading dependencies.
  // `moduleProvider` is a function
  constructor(loader, url, moduleProvider, isMain) {
    this.loader = loader;
    this.isMain = isMain;

    // moduleProvider returns { preExec, modulePromise }, where
    // modulePromise a Promise<{ module, reflect }>.
    // These fields will be copied `this` by `link()` once resolved.
    ({ preExec: this.preExec, modulePromise: this.modulePromise } =
        moduleProvider.call(loader, url, isMain));
    this.module = undefined;
    this.reflect = undefined;

    // Wait for the ModuleWrap instance being linked with all dependencies.
    const link = async () => {
      const translator = await this.modulePromise;

      if (typeof translator === 'function') {
        this.preExec = translator;
      } else {
        ({ module: this.module, reflect: this.reflect } = translator);
        assert(this.module instanceof ModuleWrap);
      }

      const dependencyJobs = [];
      const promises = this.module.link(async (specifier) => {
        const jobPromise = this.loader.getModuleJob(specifier, url);
        dependencyJobs.push(jobPromise);
        return (await (await jobPromise).modulePromise).module;
      });
      this.dependencyJobsPromise = SafePromise.all(dependencyJobs);
      if (promises)
        await SafePromise.all(promises);
    };
    // Promise for linking this module.
    this.linked = link();
    // Promise for the population of dependencyJobs.
    // This promise is only available after modulePromise.
    this.dependencyJobsPromise = undefined;
    // This promise is awaited later anyway, so silence
    // 'unhandled rejection' warnings.
    this.linked.catch(noop);

    // instantiated == deep dependency jobs wrappers instantiated,
    // module wrapper instantiated
    this.instantiated = undefined;
  }

  async instantiate() {
    if (!this.instantiated) {
      return this.instantiated = this._instantiate();
    }
    await this.instantiated;
    return this.module;
  }

  // This method instantiates the module associated with this job and its
  // entire dependency graph, i.e. creates all the module namespaces and the
  // exported/imported variables.
  async _instantiate() {
    const preExecJobs = await getPostOrderPreExecs(this, new SafeSet());
    for (const preExecJob of preExecJobs) {
      preExecJob.preExec();
    }
    const jobsInGraph = new SafeSet();
    const addJobsToDependencyGraph = async (moduleJob) => {
      if (jobsInGraph.has(moduleJob)) {
        return;
      }
      jobsInGraph.add(moduleJob);
      await moduleJob.modulePromise;
      const dependencyJobs = await moduleJob.dependencyJobsPromise;
      await moduleJob.linked;
      return Promise.all(dependencyJobs.map(addJobsToDependencyGraph));
    };
    await addJobsToDependencyGraph(this);
    try {
      if (this.isMain && process._breakFirstLine) {
        delete process._breakFirstLine;
        const initWrapper = internalBinding('inspector').callAndPauseOnStart;
        initWrapper(this.module.instantiate, this.module);
      } else {
        this.module.instantiate();
      }
    } catch (e) {
      decorateErrorStack(e);
      throw e;
    }
    for (const dependencyJob of jobsInGraph) {
      // Calling `this.module.instantiate()` instantiates not only the
      // ModuleWrap in this module, but all modules in the graph.
      dependencyJob.instantiated = resolvedPromise;
    }
    return this.module;
  }

  async run() {
    const module = await this.instantiate();
    module.evaluate(-1, false);
    return module;
  }
}

// Executes CommonJS modules with a preExec synchronously in graph
// post-order at the end of instantiate, before job.link has resolved.
async function getPostOrderPreExecs(job, seen, preExecJobs = []) {
  if (seen.has(job)) return;
  seen.add(job);
  if (job.preExec) {
    preExecJobs.push(job);
    return preExecJobs;
  }
  await job.modulePromise;
  const dependencyJobs = await job.dependencyJobsPromise;
  for (const depJob of dependencyJobs) {
    await getPostOrderPreExecs(depJob, seen, preExecJobs);
  }
  return preExecJobs;
}

Object.setPrototypeOf(ModuleJob.prototype, null);
module.exports = ModuleJob;
