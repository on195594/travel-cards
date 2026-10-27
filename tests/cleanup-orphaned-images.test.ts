import { describe, expect, it } from "vitest";
import { connectDb } from "@/lib/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  classifyObject,
  extractReferencedKeys,
  parseMinAgeHours,
} from "../scripts/cleanup-orphaned-images.mjs";

const execFileAsync = promisify(execFile);

describe("cleanup-orphaned-images pure logic", () => {
  it("parses min age hours safely and rejects negative or non-finite values", () => {
    expect(parseMinAgeHours(undefined)).toBe(24);
    expect(parseMinAgeHours(null)).toBe(24);
    expect(parseMinAgeHours("")).toBe(24);
    expect(parseMinAgeHours("48")).toBe(48);
    expect(parseMinAgeHours(0)).toBe(0);
    expect(parseMinAgeHours("0")).toBe(0);

    expect(() => parseMinAgeHours("-5")).toThrow("--min-age-hours 必须为非负有限数字");
    expect(() => parseMinAgeHours("invalid")).toThrow("--min-age-hours 必须为非负有限数字");
    expect(() => parseMinAgeHours(Number.NaN)).toThrow("--min-age-hours 必须为非负有限数字");
    expect(() => parseMinAgeHours(Number.POSITIVE_INFINITY)).toThrow("--min-age-hours 必须为非负有限数字");
  });

  it("extracts all referenced objectKeys from primary cover and variants", () => {
    const guides = [
      {
        coverImage: {
          objectKey: "guides/main-1.jpg",
          variants: [
            { objectKey: "guides/main-1-480w.webp" },
            { objectKey: "guides/main-1-960w.webp" },
          ],
        },
      },
      {
        coverImage: {
          objectKey: "guides/main-2.png",
        },
      },
      {
        coverImage: null,
      },
      {},
    ];

    const referenced = extractReferencedKeys(guides);
    expect(referenced.size).toBe(4);
    expect(referenced.has("guides/main-1.jpg")).toBe(true);
    expect(referenced.has("guides/main-1-480w.webp")).toBe(true);
    expect(referenced.has("guides/main-1-960w.webp")).toBe(true);
    expect(referenced.has("guides/main-2.png")).toBe(true);
    expect(referenced.has("guides/other.jpg")).toBe(false);
  });

  it("classifies objects accurately with fail-closed behavior for missing timestamps", () => {
    const referenced = new Set(["guides/ref-1.jpg"]);
    const now = 100_000_000;
    const minAgeMs = 24 * 60 * 60 * 1000; // 24h

    // 1. 被引用的对象
    expect(
      classifyObject({ Key: "guides/ref-1.jpg", LastModified: new Date(now - 1000) }, referenced, minAgeMs, now)
    ).toBe("referenced");

    // 2. 宽限期内未引用的对象 (仅上传 1 小时前)
    const recentDate = new Date(now - 1 * 60 * 60 * 1000);
    expect(
      classifyObject({ Key: "guides/unref-recent.jpg", LastModified: recentDate }, referenced, minAgeMs, now)
    ).toBe("protected");

    // 3. 超过宽限期未引用的对象 (上传 48 小时前)
    const oldDate = new Date(now - 48 * 60 * 60 * 1000);
    expect(
      classifyObject({ Key: "guides/unref-old.jpg", LastModified: oldDate }, referenced, minAgeMs, now)
    ).toBe("orphaned");

    // 4. P2-1: LastModified 缺失时必须 fail-closed（归入 protected）
    expect(
      classifyObject({ Key: "guides/no-date.jpg", LastModified: null }, referenced, minAgeMs, now)
    ).toBe("protected");
    expect(
      classifyObject({ Key: "guides/no-date-2.jpg", LastModified: undefined }, referenced, minAgeMs, now)
    ).toBe("protected");
    expect(
      classifyObject({ Key: "guides/invalid-date.jpg", LastModified: new Date("invalid") }, referenced, minAgeMs, now)
    ).toBe("protected");
  });
});

describe("cleanup-orphaned-images CLI and DB safety", () => {
  it("prints help and exits cleanly with --help", async () => {
    const { stdout } = await execFileAsync("node", ["scripts/cleanup-orphaned-images.mjs", "--help"]);
    expect(stdout).toContain("使用方式");
    expect(stdout).toContain("--execute");
    expect(stdout).toContain("--min-age-hours");
  });

  it("fails fast with clear error message when MONGODB_URI is absent", async () => {
    let capturedError: { code?: number; stderr?: string } | undefined;
    try {
      await execFileAsync("node", ["scripts/cleanup-orphaned-images.mjs"], {
        env: { ...process.env, MONGODB_URI: "" },
      });
    } catch (error: unknown) {
      capturedError = error as { code?: number; stderr?: string };
    }
    expect(capturedError).toBeDefined();
    expect(capturedError?.code).toBe(1);
    expect(capturedError?.stderr).toContain("MONGODB_URI");
  });

  it("identifies referenced keys from mongo and cleans up safely in test environment", async () => {
    const mongoose = await connectDb();
    const db = mongoose.connection.db;
    if (!db) throw new Error("database not connected");

    const testId = "test_cleanup_" + Date.now();
    const testObjectKey = `guides/${testId}.jpg`;
    const testVariantKey = `guides/${testId}-480w.webp`;

    let insertedId: import("mongoose").Types.ObjectId | undefined;
    try {
      const insertResult = await db.collection("guides").insertOne({
        title: "测试攻略",
        slug: "test-cleanup-slug-" + Date.now(),
        destination: "测试地",
        excerpt: "测试简介",
        days: 1,
        status: "published",
        revision: 1,
        coverImage: {
          objectKey: testObjectKey,
          publicUrl: `https://example.test/${testObjectKey}`,
          variants: [
            {
              objectKey: testVariantKey,
              publicUrl: `https://example.test/${testVariantKey}`,
              width: 480,
              height: 320,
            },
          ],
          alt: "测试封面",
        },
        itinerary: [],
        sections: [],
        sources: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      insertedId = insertResult.insertedId;

      const referencedDoc = await db.collection("guides").findOne({
        "coverImage.objectKey": testObjectKey,
      });
      expect(referencedDoc).not.toBeNull();
      expect(referencedDoc?.coverImage?.variants?.[0]?.objectKey).toBe(testVariantKey);

      const referencedKeys = extractReferencedKeys([referencedDoc as unknown as { coverImage?: { objectKey?: string; variants?: Array<{ objectKey?: string }> } }]);
      expect(referencedKeys.has(testObjectKey)).toBe(true);
      expect(referencedKeys.has(testVariantKey)).toBe(true);
    } finally {
      if (insertedId) {
        await db.collection("guides").deleteOne({ _id: insertedId });
      }
    }
  });
});
