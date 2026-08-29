import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-admin-password.mjs '<password>'");
  process.exit(1);
}
const salt = randomBytes(16);
const digest = await promisify(scrypt)(password, salt, 64);
process.stdout.write(`scrypt$${salt.toString("hex")}$${Buffer.from(digest).toString("hex")}\n`);
