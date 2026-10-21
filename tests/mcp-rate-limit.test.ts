import mongoose from "mongoose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { consumeMcpToolCall, MCP_TOOL_CALLS_PER_MINUTE } from "@/lib/mcp/rate-limit";

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
function db() {
  if (!mongoose.connection.db || mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database access");
  return mongoose.connection.db.collection<{ _id: string; count: number; expiresAt: Date }>("mcp_tool_rate_limits");
}
afterEach(async () => {
  vi.restoreAllMocks();
  if (mongoose.connection.db) await db().deleteMany({ _id: /^rate-test-/ });
});
afterAll(async () => { await mongoose.disconnect(); global.mongooseConnection = undefined; });

describe("persistent MCP tool rate limits", () => {
  it("atomically admits only 120 concurrent calls to the same grant window", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const label = `rate-test-concurrent-${runId}`;
    const decisions = await Promise.all(Array.from({ length: MCP_TOOL_CALLS_PER_MINUTE + 10 }, () => consumeMcpToolCall(label)));
    expect(decisions.filter((retryAfter) => retryAfter === 0)).toHaveLength(MCP_TOOL_CALLS_PER_MINUTE);
    expect(decisions.filter((retryAfter) => retryAfter > 0)).toHaveLength(10);
    expect(Math.max(...decisions)).toBeLessThanOrEqual(60);
    expect(await db().findOne({ _id: `${label}:${Math.floor(now / 60_000)}` })).toMatchObject({ count: MCP_TOOL_CALLS_PER_MINUTE + 10 });
    expect(await consumeMcpToolCall(`rate-test-other-${runId}`)).toBe(0);
  });

  it("starts a new window without relying on TTL deletion", async () => {
    const start = Math.floor(Date.now() / 60_000) * 60_000 + 60_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + 59_001);
    const label = `rate-test-reset-${runId}`;
    await consumeMcpToolCall(label);
    await db().updateOne({ _id: `${label}:${Math.floor(start / 60_000)}` }, { $set: { count: MCP_TOOL_CALLS_PER_MINUTE } });
    expect(await consumeMcpToolCall(label)).toBe(1);
    clock.mockReturnValue(start + 60_000);
    expect(await consumeMcpToolCall(label)).toBe(0);
    expect(await db().countDocuments({ _id: new RegExp(`^${label}:`) })).toBe(2);
    expect((await db().indexes()).some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
  });
});
