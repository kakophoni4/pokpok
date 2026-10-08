import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export async function hashHostPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyHostPassword(password: string, encoded?: string | null): Promise<boolean> {
  const [salt, hex] = (encoded ?? "").split(":");
  const valid = /^[a-f0-9]{32}$/.test(salt ?? "") && /^[a-f0-9]{128}$/.test(hex ?? "");
  // Missing accounts take the same expensive path as a wrong password.
  const key = await scrypt(password, valid ? salt! : "0".repeat(32), 64) as Buffer;
  const expected = Buffer.from(valid ? hex! : "0".repeat(128), "hex");
  return timingSafeEqual(key, expected) && valid;
}
