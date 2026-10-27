#!/usr/bin/env node

/**
 * 孤立图片对象扫描与清理运维脚本
 * 
 * 作用：
 * 扫描 Cloudflare R2 存储桶中的图片对象，与 MongoDB guides 集合中已引用的
 * 封面图（包括各规格 WebP 变体）进行比对，找出未被任何攻略引用的孤立图片，
 * 并在满足安全保留期（默认 24 小时）的前提下安全清理。
 * 
 * 使用方式：
 *   node scripts/cleanup-orphaned-images.mjs               # 默认安全预览 (dry-run)
 *   node scripts/cleanup-orphaned-images.mjs --execute     # 真正执行删除
 *   node scripts/cleanup-orphaned-images.mjs --min-age-hours=48 # 自定义安全宽限期
 */

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import mongoose from "mongoose";

const { MongoClient } = mongoose.mongo;

export function parseMinAgeHours(raw) {
  if (raw === undefined || raw === null || raw === "") return 24;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--min-age-hours 必须为非负有限数字，收到: ${String(raw)}`);
  }
  return parsed;
}

export function extractReferencedKeys(guides) {
  const referencedKeys = new Set();
  for (const guide of guides) {
    if (Array.isArray(guide?.attachments)) {
      for (const attachment of guide.attachments) {
        if (attachment?.objectKey) {
          referencedKeys.add(attachment.objectKey);
        }
      }
    }
    if (!guide?.coverImage) continue;
    if (guide.coverImage.objectKey) {
      referencedKeys.add(guide.coverImage.objectKey);
    }
    if (Array.isArray(guide.coverImage.variants)) {
      for (const variant of guide.coverImage.variants) {
        if (variant?.objectKey) {
          referencedKeys.add(variant.objectKey);
        }
      }
    }
  }
  return referencedKeys;
}

export function classifyObject(obj, referencedKeys, minAgeMs, now) {
  if (!obj.Key || referencedKeys.has(obj.Key)) {
    return "referenced";
  }
  // P2-1: 缺失 LastModified 时失败关闭（fail-closed），归入受保护集合
  if (!obj.LastModified || !(obj.LastModified instanceof Date) || Number.isNaN(obj.LastModified.getTime())) {
    return "protected";
  }
  const ageMs = now - obj.LastModified.getTime();
  if (ageMs < minAgeMs) {
    return "protected";
  }
  return "orphaned";
}

const options = {
  execute: { type: "boolean", default: false },
  "dry-run": { type: "boolean", default: false },
  "min-age-hours": { type: "string", default: "24" },
  prefix: { type: "string", default: "guides/" },
  help: { type: "boolean", short: "h", default: false },
};

export async function runCli() {
  const { values } = parseArgs({ options, allowPositionals: false });
  if (values.help) {
    console.log(`
使用方式:
  node scripts/cleanup-orphaned-images.mjs [选项]

选项:
  --dry-run             安全预览模式 (默认)，不执行删除
  --execute             确认执行删除孤立图片
  --min-age-hours=<num> 保护宽限期 (默认 24 小时)，小于该时间的图片不清理
  --prefix=<prefix>     对象前缀 (默认 "guides/")
  -h, --help            查看帮助
`);
    return;
  }

  const isDryRun = !values.execute || values["dry-run"];
  const minAgeHours = parseMinAgeHours(values["min-age-hours"]);
  const prefix = values.prefix || "guides/";

  const mongoUri = process.env.MONGODB_URI;
  const mongoDbName = process.env.MONGODB_DB;
  const r2Endpoint = process.env.R2_ENDPOINT;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET;

  if (!mongoUri) {
    console.error("错误: 未配置 MONGODB_URI 环境变量");
    process.exit(1);
  }

  if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    console.error("错误: 未完整配置 R2 环境变量 (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)");
    process.exit(1);
  }

  const minAgeMs = minAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  console.log("=== Travel Cards 孤立媒体与附件扫描清理工具 ===");
  console.log(`运行模式: ${isDryRun ? "安全预览 (DRY RUN - 不执行删除)" : "执行删除 (--execute)"}`);
  console.log(`安全保留期: 最近 ${minAgeHours} 小时内上传的对象受保护，不清理`);
  console.log(`对象前缀: ${prefix}\n`);

  // 1. 连接 MongoDB 获取所有引用的图片与附件 Keys
  console.log("正在连接 MongoDB 读取已引用对象 Keys...");
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const db = mongoDbName ? mongoClient.db(mongoDbName) : mongoClient.db();

  const guides = await db.collection("guides").find(
    {
      $or: [
        { coverImage: { $exists: true, $ne: null } },
        { "attachments.0": { $exists: true } },
      ],
    },
    {
      projection: {
        "coverImage.objectKey": 1,
        "coverImage.variants.objectKey": 1,
        "attachments.objectKey": 1,
      },
    }
  ).toArray();

  const referencedKeys = extractReferencedKeys(guides);
  console.log(`MongoDB 扫描完成: 共找到 ${guides.length} 篇含媒体或附件的攻略，合计引用 ${referencedKeys.size} 个有效对象。\n`);

  // 2. 连接 R2 并分页扫描对象
  console.log("正在连接 R2 扫描存储桶对象...");
  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    maxAttempts: 3,
  });

  let totalR2Objects = 0;
  let totalBytes = 0;
  const orphanedObjects = [];
  const protectedObjects = [];
  let continuationToken = undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: r2Bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await s3.send(listCommand);
    const contents = response.Contents || [];

    for (const obj of contents) {
      if (!obj.Key) continue;
      totalR2Objects++;
      totalBytes += obj.Size || 0;

      const classification = classifyObject(obj, referencedKeys, minAgeMs, now);
      const ageHours = obj.LastModified ? ((now - obj.LastModified.getTime()) / (1000 * 60 * 60)).toFixed(1) : "未知";

      if (classification === "orphaned") {
        orphanedObjects.push({
          Key: obj.Key,
          Size: obj.Size || 0,
          LastModified: obj.LastModified,
          ageHours,
        });
      } else if (classification === "protected") {
        protectedObjects.push({
          Key: obj.Key,
          Size: obj.Size || 0,
          LastModified: obj.LastModified,
          ageHours,
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`R2 扫描完成: 存储桶前缀 "${prefix}" 下共发现 ${totalR2Objects} 个对象 (${(totalBytes / 1024 / 1024).toFixed(2)} MB)。`);
  console.log(`- 正常引用: ${totalR2Objects - orphanedObjects.length - protectedObjects.length} 个`);
  console.log(`- 宽限期内或未标注时间 (保留保护): ${protectedObjects.length} 个`);
  console.log(`- 超过宽限期孤立待清理: ${orphanedObjects.length} 个\n`);

  if (protectedObjects.length > 0) {
    console.log("--- 受保护未清理对象 (宽限期内或时间戳未知) ---");
    for (const obj of protectedObjects) {
      console.log(`  [保护] ${obj.Key} (${(obj.Size / 1024).toFixed(1)} KB, 年龄: ${obj.ageHours} 小时)`);
    }
    console.log();
  }

  if (orphanedObjects.length === 0) {
    console.log("结果: 没有需要清理的孤立图片对象。存储状态健康！");
    await mongoClient.close();
    return;
  }

  const orphanedBytes = orphanedObjects.reduce((acc, obj) => acc + obj.Size, 0);
  console.log(`--- 待清理孤立对象清单 (共 ${orphanedObjects.length} 个, ${(orphanedBytes / 1024 / 1024).toFixed(2)} MB) ---`);
  for (const obj of orphanedObjects) {
    console.log(`  [待清理] ${obj.Key} (${(obj.Size / 1024).toFixed(1)} KB, 上传于 ${obj.ageHours} 小时前)`);
  }
  console.log();

  // 3. 执行删除或提示
  if (isDryRun) {
    console.log("提示: 当前为 DRY RUN 模式，未执行任何删除操作。");
    console.log("若确认清理上述孤立对象，请运行: node scripts/cleanup-orphaned-images.mjs --execute");
  } else {
    console.log("正在执行批量安全删除...");
    const batchSize = 1000;
    let deletedCount = 0;

    for (let i = 0; i < orphanedObjects.length; i += batchSize) {
      const batchCandidates = orphanedObjects.slice(i, i + batchSize).map((o) => o.Key);

      // P1-3: 执行删除前对该批次候选对象进行二次 MongoDB 实时复查，防止扫描期间并发绑定造成的竞态误删
      const recheckedGuides = await db.collection("guides").find(
        {
          $or: [
            { "coverImage.objectKey": { $in: batchCandidates } },
            { "coverImage.variants.objectKey": { $in: batchCandidates } },
            { "attachments.objectKey": { $in: batchCandidates } },
          ],
        },
        {
          projection: {
            "coverImage.objectKey": 1,
            "coverImage.variants.objectKey": 1,
            "attachments.objectKey": 1,
          },
        }
      ).toArray();

      const latestReferenced = extractReferencedKeys(recheckedGuides);
      const safeBatch = batchCandidates
        .filter((key) => {
          if (latestReferenced.has(key)) {
            console.warn(`  [竞态保护跳过] 对象 ${key} 在扫描期间已被新攻略引用，取消删除！`);
            return false;
          }
          return true;
        })
        .map((Key) => ({ Key }));

      if (safeBatch.length === 0) {
        continue;
      }

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: r2Bucket,
        Delete: { Objects: safeBatch, Quiet: false },
      });

      const deleteRes = await s3.send(deleteCommand);

      // P1-2: 严谨处理部分失败响应，检查 Errors 数组
      if (Array.isArray(deleteRes.Errors) && deleteRes.Errors.length > 0) {
        for (const err of deleteRes.Errors) {
          console.error(`  [删除失败] ${err.Key}: ${err.Code} - ${err.Message}`);
        }
        process.exitCode = 1;
      }

      deletedCount += deleteRes.Deleted?.length || 0;
    }

    console.log(`成功清理 ${deletedCount} 个孤立对象，释放空间 ${(orphanedBytes / 1024 / 1024).toFixed(2)} MB！`);
  }

  await mongoClient.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch((err) => {
    console.error("执行失败:", err);
    process.exit(1);
  });
}
