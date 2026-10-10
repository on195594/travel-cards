import { mcpPost, mcpUnsupported } from "@/lib/mcp/http-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = mcpPost;
export const GET = mcpUnsupported;
export const HEAD = mcpUnsupported;
export const DELETE = mcpUnsupported;
export const OPTIONS = mcpUnsupported;
