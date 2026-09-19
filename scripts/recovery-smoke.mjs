import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";

const { BSON, MongoClient, ObjectId } = mongoose.mongo;
const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
const container = process.env.TRAVEL_CARDS_TEST_MONGO_CONTAINER;
const uri = process.env.MONGODB_URI;

assert.match(runId ?? "", /^\d+_\d+$/, "missing or invalid test run id");
assert.equal(container, `travel-cards-test-${runId.replaceAll("_", "-")}`);
assert.ok(uri, "missing test MongoDB URI");

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed (${result.status})`);
  }
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  return BSON.EJSON.stringify(value, { canonical: true, relaxed: false });
}

function normalizedIndexes(indexes) {
  return indexes
    .map(({ name, key, unique = false, partialFilterExpression = null }) => ({
      name,
      key,
      unique,
      partialFilterExpression,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

const inspect = JSON.parse(runDocker(["inspect", container]));
assert.equal(inspect.length, 1);
const ownedContainer = inspect[0];
assert.equal(ownedContainer.Config?.Labels?.["travel-cards.test-run"], runId);
const published = ownedContainer.NetworkSettings?.Ports?.["27017/tcp"];
assert.equal(published?.length, 1);
assert.equal(published[0].HostIp, "127.0.0.1");

const parsedUri = new URL(uri);
const sourceDbName = `travel_cards_test_${runId}`;
const restoreDbName = `travel_cards_restore_test_${runId}`;
const sentinelDbName = `travel_cards_sentinel_test_${runId}`;
assert.equal(parsedUri.hostname, "127.0.0.1");
assert.equal(parsedUri.port, published[0].HostPort);
assert.equal(parsedUri.pathname, `/${sourceDbName}`);
assert.equal(parsedUri.username, "");
assert.equal(parsedUri.password, "");

const dumpVersion = runDocker(["exec", container, "mongodump", "--version"])
  .split("\n")[0]
  .trim();
const restoreVersion = runDocker(["exec", container, "mongorestore", "--version"])
  .split("\n")[0]
  .trim();
assert.ok(dumpVersion && restoreVersion);

const root = await mkdtemp(join(tmpdir(), `travel-cards-recovery-${runId}-`));
const objectKey = "guides/synthetic.png";
const sourceObject = join(root, "source", objectKey);
const backupObject = join(root, "backup", "objects", objectKey);
const restoredObject = join(root, "restored", objectKey);
const archivePath = join(root, "backup", "travel-cards.archive.gz");
const manifestPath = join(root, "backup", "manifest.json");
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1ZkAAAAASUVORK5CYII=",
  "base64"
);

const now = new Date("2026-09-18T00:00:00.000Z");
const publishedGuide = {
  _id: new ObjectId(),
  title: "Synthetic published guide",
  slug: `synthetic-${runId}`,
  destination: "Fixture",
  excerpt: "Recovery fixture",
  days: 1,
  coverImage: {
    objectKey,
    publicUrl: "https://images.example.test/guides/synthetic.png",
    alt: "Synthetic pixel",
  },
  itinerary: [{ day: 1, title: "Day one", items: [] }],
  sections: [],
  sources: [],
  status: "published",
  revision: 7,
  publishedAt: now,
  slugLocked: true,
  createdAt: now,
  updatedAt: now,
};
const withdrawnGuide = {
  ...publishedGuide,
  _id: new ObjectId(),
  title: "Synthetic withdrawn guide",
  slug: `withdrawn-${runId}`,
  status: "draft",
  revision: 9,
  publishedAt: undefined,
};

let client;
let objectServer;
try {
  await mkdir(join(root, "source", "guides"), { recursive: true });
  await writeFile(sourceObject, imageBytes);

  objectServer = createServer(async (request, response) => {
    if (request.url !== `/${objectKey}`) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(restoredObject);
      response.writeHead(200, { "content-type": "image/png", "content-length": bytes.length });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    objectServer.once("error", reject);
    objectServer.listen(0, "127.0.0.1", resolve);
  });
  const address = objectServer.address();
  assert.ok(address && typeof address === "object");
  const publicBaseUrl = `http://127.0.0.1:${address.port}/`;
  publishedGuide.coverImage.publicUrl = new URL(objectKey, publicBaseUrl).toString();

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 });
  await client.connect();
  const sourceDb = client.db(sourceDbName);
  const restoreDb = client.db(restoreDbName);
  const sentinelDb = client.db(sentinelDbName);
  const guides = sourceDb.collection("guides");
  const sentinel = sentinelDb.collection("sentinel");

  await guides.createIndexes([
    {
      key: { slug: 1 },
      name: "slug_1",
      unique: true,
      partialFilterExpression: { slug: { $type: "string" } },
    },
    { key: { status: 1, publishedAt: -1 }, name: "status_1_publishedAt_-1" },
    { key: { updatedAt: -1 }, name: "updatedAt_-1" },
  ]);
  await guides.insertMany([publishedGuide, withdrawnGuide]);
  await sentinel.createIndex({ marker: 1 }, { name: "marker_1", unique: true });
  await sentinel.insertOne({ marker: `sentinel-${runId}`, payload: "must-not-change" });

  const sourceDocuments = await guides.find({}).sort({ _id: 1 }).toArray();
  const sourceIndexes = normalizedIndexes(await guides.listIndexes().toArray());
  const sentinelBefore = canonical({
    documents: await sentinel.find({}).sort({ _id: 1 }).toArray(),
    indexes: normalizedIndexes(await sentinel.listIndexes().toArray()),
  });

  const archive = runDocker(
    ["exec", container, "mongodump", "--db", sourceDbName, "--archive", "--gzip"],
    { encoding: null }
  );
  assert.ok(Buffer.isBuffer(archive) && archive.length > 0);
  await mkdir(join(root, "backup", "objects", "guides"), { recursive: true });
  await writeFile(archivePath, archive);
  await cp(sourceObject, backupObject);

  const objectBackup = await readFile(backupObject);
  const manifest = {
    database: sourceDbName,
    storage: { kind: "synthetic-http", publicBaseUrl, objectRoot: "objects" },
    archive: {
      file: "travel-cards.archive.gz",
      bytes: archive.length,
      sha256: sha256(archive),
    },
    objects: [{ objectKey, bytes: objectBackup.length, sha256: sha256(objectBackup) }],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  runDocker(
    [
      "exec",
      "-i",
      container,
      "mongorestore",
      "--archive",
      "--gzip",
      `--nsFrom=${sourceDbName}.*`,
      `--nsTo=${restoreDbName}.*`,
    ],
    { input: archive, encoding: null }
  );

  const restoredGuides = restoreDb.collection("guides");
  const restoredDocuments = await restoredGuides.find({}).sort({ _id: 1 }).toArray();
  const restoredIndexes = normalizedIndexes(await restoredGuides.listIndexes().toArray());
  assert.equal(canonical(restoredDocuments), canonical(sourceDocuments));
  assert.deepEqual(restoredIndexes, sourceIndexes);

  const restoredPublished = await restoredGuides
    .find({ status: "published" })
    .project({ _id: 0, slug: 1 })
    .toArray();
  assert.deepEqual(restoredPublished, [{ slug: publishedGuide.slug }]);
  await assert.rejects(
    restoredGuides.insertOne({
      ...publishedGuide,
      _id: new ObjectId(),
      title: "Duplicate slug",
    }),
    (error) => error?.code === 11000
  );

  await mkdir(join(root, "restored", "guides"), { recursive: true });
  await cp(backupObject, restoredObject);
  const restoredBytes = await readFile(restoredObject);
  assert.equal(restoredBytes.length, manifest.objects[0].bytes);
  assert.equal(sha256(restoredBytes), manifest.objects[0].sha256);
  const restoredPublishedGuide = restoredDocuments.find(({ status }) => status === "published");
  const expectedPublicUrl = new URL(objectKey, manifest.storage.publicBaseUrl).toString();
  assert.equal(restoredPublishedGuide?.coverImage?.publicUrl, expectedPublicUrl);
  const publicImage = await fetch(expectedPublicUrl);
  assert.equal(publicImage.status, 200);
  const publicBytes = Buffer.from(await publicImage.arrayBuffer());
  assert.equal(publicBytes.length, manifest.objects[0].bytes);
  assert.equal(sha256(publicBytes), manifest.objects[0].sha256);
  const corrupted = Buffer.from(restoredBytes);
  corrupted[corrupted.length - 1] ^= 0xff;
  assert.notEqual(sha256(corrupted), manifest.objects[0].sha256);

  const sentinelAfter = canonical({
    documents: await sentinel.find({}).sort({ _id: 1 }).toArray(),
    indexes: normalizedIndexes(await sentinel.listIndexes().toArray()),
  });
  assert.equal(sentinelAfter, sentinelBefore);

  console.log(
    `recovery-smoke PASS run=${runId} guides=${restoredDocuments.length} indexes=${restoredIndexes.length} objectBytes=${restoredBytes.length} checksum=verified publicImage=verified corruption=detected sentinel=unchanged tools=${dumpVersion}/${restoreVersion}`
  );
} finally {
  if (objectServer) {
    objectServer.closeIdleConnections();
    await new Promise((resolve, reject) => objectServer.close((error) => error ? reject(error) : resolve()));
  }
  await client?.close();
  await rm(root, { recursive: true, force: true });
}
