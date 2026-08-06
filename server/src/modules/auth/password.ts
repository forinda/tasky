import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 32
const PREFIX = 'scrypt'

/**
 * Format: `scrypt$<salt-hex>$<hash-hex>`.
 *
 * The salt is stored alongside the hash because it must be recoverable to
 * verify, and it is not secret — its job is to make identical passwords hash
 * differently so one cracked hash does not crack every reuse of that password.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(plain, salt, KEY_LENGTH)
  return `${PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [prefix, saltHex, hashHex] = stored.split('$')
  if (prefix !== PREFIX || !saltHex || !hashHex) return false

  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  // Buffer.from ignores invalid hex rather than throwing, so length is the
  // real guard — a corrupt row must fail the login, not crash the request.
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false

  const derived = await scryptAsync(plain, salt, KEY_LENGTH)
  // timingSafeEqual, not ===, so comparison time does not leak how many bytes
  // matched. It throws on length mismatch, which the guard above prevents.
  return timingSafeEqual(derived, expected)
}
