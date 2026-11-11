import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureMcpModelReady } from "@/lib/mcp/model-ready";

afterEach(() => vi.restoreAllMocks());

describe("MCP model initialization recovery", () => {
  function model() {
    return mongoose.createConnection().model("McpReadinessTest", new mongoose.Schema({ key: String }, { autoCreate: false }));
  }

  it("deduplicates concurrent initialization and recovers on subsequent calls after a failure", async () => {
    const target = model();
    const failure = new Error("temporary index failure");
    vi.spyOn(target, "ensureIndexes").mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    vi.spyOn(target, "createCollection").mockResolvedValue(target.collection);

    // Initial failure is surfaced
    await expect(ensureMcpModelReady(target)).rejects.toBe(failure);

    // Subsequent concurrent calls attempt recovery and succeed once
    await expect(Promise.all([ensureMcpModelReady(target), ensureMcpModelReady(target)])).resolves.toBeDefined();

    // Already-ready model reuses readiness cleanly
    await expect(ensureMcpModelReady(target)).resolves.toBeUndefined();
  });
});
