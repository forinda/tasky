import { createHash, randomBytes } from 'node:crypto'
import { ConfigService, Inject, Service } from '@forinda/kickjs'
import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'

/** Bytes of entropy in a refresh token. 256 bits — not guessable, not a JWT. */
const REFRESH_BYTES = 32

/**
 * The refresh token is stored only as this digest, so a leaked database yields
 * nothing presentable to /auth/refresh.
 *
 * sha256 rather than scrypt is right here and would be wrong for a password:
 * the input is 256 bits of uniform randomness with no dictionary to run against
 * it, so a slow KDF adds latency to every request and buys no security.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** `15m`, `30d`, `900s` → milliseconds. Throws on anything else. */
function durationToMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(duration.trim())
  if (!match) {
    throw new Error(
      `Invalid duration "${duration}". Use a number followed by s, m, h, or d — e.g. 15m or 30d.`,
    )
  }
  const value = Number(match[1])
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
  return value * factor
}

@Service()
export class Tokens {
  private readonly secret: Uint8Array
  private readonly accessTtl: string
  private readonly refreshTtlMs: number

  // `@Value` cannot annotate a constructor parameter in this version, so the
  // env comes through ConfigService — which also keeps the class directly
  // constructible in tests via `new Tokens(new ConfigService())`.
  constructor(@Inject(ConfigService) config: ConfigService) {
    this.secret = new TextEncoder().encode(config.get('JWT_SECRET'))
    this.accessTtl = config.get('ACCESS_TOKEN_TTL')
    this.refreshTtlMs = durationToMs(config.get('REFRESH_TOKEN_TTL'))
  }

  /** Short-lived, in-memory-only on the client. Renewal goes through refresh. */
  async signAccess(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALG })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.accessTtl)
      .sign(this.secret)
  }

  /**
   * An opaque random string, deliberately not a JWT. It carries no claims and
   * must be checked against the database on every use anyway, so a signature
   * would add bytes and a second way to be wrong without adding a guarantee.
   *
   * Returns the plaintext once — the caller sets it as a cookie and stores only
   * the hash. Nothing can recover it afterwards.
   */
  mintRefresh(): { token: string; hash: string; expiresAt: Date } {
    const token = randomBytes(REFRESH_BYTES).toString('base64url')
    return {
      token,
      hash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    }
  }

  /** Returns the subject, or null for any invalid token. Never throws. */
  async verify(token: string): Promise<string | null> {
    try {
      // Pinning algorithms rejects a token whose header claims `none` or an
      // asymmetric alg — the classic JWT confusion attack.
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: [ALG],
        // A token with no `exp` never expires. `signAccess()` always sets one,
        // so this turns a convention into a verification requirement —
        // otherwise anyone who can mint tokens can mint an immortal one.
        requiredClaims: ['exp'],
      })
      return typeof payload.sub === 'string' ? payload.sub : null
    } catch {
      return null
    }
  }
}
