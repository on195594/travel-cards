import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, saltHex, digestHex, ...extra] = encoded.split("$");
  if (version !== "scrypt" || extra.length || !/^[0-9a-f]+$/i.test(saltHex ?? "") || !/^[0-9a-f]+$/i.test(digestHex ?? "") || saltHex.length % 2 || digestHex.length % 2) return false;

  try {
    const expected = Buffer.from(digestHex, "hex");
    if (!expected.length) return false;
    const actual = Buffer.from(await derive(password, Buffer.from(saltHex, "hex"), expected.length));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
