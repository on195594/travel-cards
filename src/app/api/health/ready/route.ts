import { NextResponse } from "next/server";
import { isDbReady } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = await isDbReady(2000);
  if (!ready) {
    return NextResponse.json(
      { status: "unavailable", error: "Database not reachable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }

  return NextResponse.json(
    { status: "ready" },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
