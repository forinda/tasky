import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 32
const PREFIX = 'scrypt'

/** Current cost. Raise N as hardware improves — see the format note below. */
const N = 16384
const R = 8
const P = 1

/** What a 3-segment legacy hash was made with, before cost was recorded. */
const LEGACY = { N: 16384, r: 8, p: 1 }

/**
 * Format: `scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>`.
 *
 * The cost parameters are stored **in the hash** rather than read from the
 * constants above, because raising N — the correct response to faster
 * hardware — would otherwise lock out every existing user: verification would
 * derive with the new cost against a digest made with the old one, and fail.
 * Recording them means old hashes keep verifying at their original cost while
 * new ones use the current setting.
 *
 * The salt is stored alongside because it must be recoverable to verify, and it
 * is not secret — its job is to make identical passwords hash differently so one
 * cracked hash does not crack every reuse of that password.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(plain, salt, KEY_LENGTH, { N, r: R, p: P })
  return `${PREFIX}$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts[0] !== PREFIX) return false

  let saltHex: string | undefined
  let hashHex: string | undefined
  let cost: { N: number; r: number; p: number }

  if (parts.length === 6) {
    const [, n, r, p, salt, hash] = parts
    cost = { N: Number(n), r: Number(r), p: Number(p) }
    if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
      return false
    }
    saltHex = salt
    hashHex = hash
  } else if (parts.length === 3) {
    // Legacy: written before the cost was recorded, so it used these values.
    cost = LEGACY
    saltHex = parts[1]
    hashHex = parts[2]
  } else {
    return false
  }

  if (!saltHex || !hashHex) return false

  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  // Buffer.from ignores invalid hex rather than throwing, so length is the real
  // guard — a corrupt row must fail the login, not crash the request.
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false

  let derived: Buffer
  try {
    derived = await scryptAsync(plain, salt, KEY_LENGTH, cost)
  } catch {
    // Absurd parameters in a stored value would otherwise reject the request
    // with a crash instead of a failed login.
    return false
  }

  // timingSafeEqual, not ===, so comparison time does not leak how many bytes
  // matched. It throws on length mismatch, which the guard above prevents.
  return timingSafeEqual(derived, expected)
}
