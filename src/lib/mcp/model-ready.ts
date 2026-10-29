type IndexModel = {
  init(): Promise<unknown>;
  createCollection(): Promise<unknown>;
  createIndexes(): Promise<unknown>;
};

const readiness = new WeakMap<IndexModel, Promise<void>>();
const failedInit = new WeakSet<IndexModel>();

// Mongoose caches a rejected init() too. These MCP models have ordinary collections
// and schema indexes, so public APIs can restore readiness on a later request.
export function ensureMcpModelReady(model: IndexModel): Promise<void> {
  const existing = readiness.get(model);
  if (existing) return existing;

  const pending = (async () => {
    if (failedInit.has(model)) {
      await model.createCollection();
      await model.createIndexes();
    } else {
      await model.init();
    }
  })().catch((error) => {
    failedInit.add(model);
    readiness.delete(model);
    throw error;
  });
  readiness.set(model, pending);
  return pending;
}
