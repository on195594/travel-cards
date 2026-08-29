import { scrypt } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/password";

const derive = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;

async function hash(password: string) {
  const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const digest = await derive(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

describe("verifyPassword", () => {
  it("accepts only the matching scrypt password", async () => {
    const encoded = await hash("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong", encoded)).resolves.toBe(false);
  });

  it.each(["", "bcrypt$salt$digest", "scrypt$zz$00", "scrypt$00$zz", "scrypt$00$"])('fails closed for malformed hash "%s"', async (encoded) => {
    await expect(verifyPassword("anything", encoded)).resolves.toBe(false);
  });
});
