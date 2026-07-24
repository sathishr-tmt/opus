export function resolve(spec, ctx, next) { return next(spec, ctx); }
export function load(url, ctx, next) {
  if (url.endsWith('/src/repos.js')) {
    return { format:'module', shortCircuit:true, source: `
      export async function listSavedJobs(){ return globalThis.__stub.savedRows; }
      export async function listApplications(){ return globalThis.__stub.applicationRows; }
    `};
  }
  if (url.endsWith('/src/jobCache.js')) {
    return { format:'module', shortCircuit:true, source: `export function getJob(){ return null; }` };
  }
  return next(url, ctx);
}
