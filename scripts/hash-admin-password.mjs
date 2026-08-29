import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const password = readFileSync(0, "utf8").replace(/[\r\n]+$/, "");
if (!password) {
  console.error("Usage: printf '%s' '<password>' | node scripts/hash-admin-password.mjs");
  process.exit(1);
}
const salt = randomBytes(16);
const digest = await promisify(scrypt)(password, salt, 64);
process.stdout.write(`scrypt$${salt.toString("hex")}$${Buffer.from(digest).toString("hex")}\n`);
