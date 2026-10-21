import mongoose, { Schema } from "mongoose";
import { connectDb } from "@/lib/db";

export const MCP_TOOL_CALLS_PER_MINUTE = 120;
const windowMs = 60_000;
const schema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Window = mongoose.models.McpToolRateLimit || mongoose.model("McpToolRateLimit", schema, "mcp_tool_rate_limits");

export async function consumeMcpToolCall(actorLabel: string): Promise<number> {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const expiresAt = new Date((window + 1) * windowMs);
  await connectDb();
  await Window.init();
  // The actor label comes from the authenticated grant, never client-supplied metadata.
  const counter = await Window.findOneAndUpdate({ _id: `${actorLabel}:${window}` }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt },
  }, { upsert: true, returnDocument: "after" }).lean();
  return counter!.count > MCP_TOOL_CALLS_PER_MINUTE ? Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) : 0;
}
