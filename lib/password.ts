import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Hash a plaintext password with a random salt using Node's built-in scrypt.
 * Stored format: `scrypt$<saltHex>$<hashHex>`. No external dependency, and the
 * salt travels with the hash so verification needs nothing else.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored `scrypt$salt$hash` string.
 * Uses a constant-time comparison so a wrong password and a wrong length both
 * cost the same to probe.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, hashHex] = parts;
  const storedHash = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  if (storedHash.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedHash, derived);
}
