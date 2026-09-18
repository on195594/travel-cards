import mongoose from "mongoose";
import { afterAll, describe, expect, it } from "vitest";
import { GET as liveGet } from "@/app/api/health/live/route";
import { GET as readyGet } from "@/app/api/health/ready/route";
import { connectDb } from "@/lib/db";

afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("health endpoints", () => {
  it("GET /api/health/live returns 200 with status ok", async () => {
    const response = liveGet();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("GET /api/health/ready returns 200 when db is connected", async () => {
    await connectDb();
    const response = await readyGet();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "ready" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rebuilds the cached connection after a real disconnect", async () => {
    await connectDb();
    await mongoose.disconnect();
    expect(mongoose.connection.readyState).toBe(0);

    await connectDb();
    expect(mongoose.connection.readyState).toBe(1);
    await expect(mongoose.connection.db!.admin().ping()).resolves.toMatchObject({ ok: 1 });
  });
});
