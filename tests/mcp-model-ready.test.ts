import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureMcpModelReady } from "@/lib/mcp/model-ready";

afterEach(() => vi.restoreAllMocks());

describe("MCP model initialization recovery (real Mongoose, fake index transport)", () => {
  function model() {
    // A disconnected, independent connection prevents accidental database access.
    return mongoose.createConnection().model("McpReadinessTest", new mongoose.Schema({ key: String }, { autoCreate: false }));
  }

  it("recovers a cached init rejection once for concurrent requests and reuses successful readiness", async () => {
    const target = model();
    const failure = new Error("temporary index failure");
    const indexes = vi.spyOn(target, "ensureIndexes").mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const collection = vi.spyOn(target, "createCollection").mockResolvedValue(target.collection);

    await expect(ensureMcpModelReady(target)).rejects.toBe(failure);
    // Reproduce the upstream cached rejection: retrying init() alone cannot recover.
    await expect(target.init()).rejects.toBe(failure);
    expect(indexes).toHaveBeenCalledTimes(1);

    await Promise.all(Array.from({ length: 8 }, () => ensureMcpModelReady(target)));
    expect(collection).toHaveBeenCalledTimes(1);
    expect(indexes).toHaveBeenCalledTimes(2);
    await ensureMcpModelReady(target);
    expect(collection).toHaveBeenCalledTimes(1);
    expect(indexes).toHaveBeenCalledTimes(2);
  });

  it.each(["collection", "indexes"])("keeps rejecting after a %s recovery failure until a later request succeeds", async (stage) => {
    const target = model();
    const initial = new Error("initial failure");
    const recovery = new Error("recovery failure");
    const indexes = vi.spyOn(target, "ensureIndexes").mockRejectedValueOnce(initial);
    const collection = vi.spyOn(target, "createCollection");
    if (stage === "collection") {
      collection.mockRejectedValueOnce(recovery);
    } else {
      indexes.mockRejectedValueOnce(recovery);
    }
    collection.mockResolvedValue(target.collection);
    indexes.mockResolvedValue(undefined);

    await expect(ensureMcpModelReady(target)).rejects.toBe(initial);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => ensureMcpModelReady(target)));
    expect(results).toEqual(Array.from({ length: 8 }, () => ({ status: "rejected", reason: recovery })));
    expect(collection).toHaveBeenCalledTimes(1);
    await ensureMcpModelReady(target);
    expect(collection).toHaveBeenCalledTimes(2);
  });
});
