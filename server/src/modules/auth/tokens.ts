import { ConfigService, Inject, Service } from '@forinda/kickjs'
import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'

@Service()
export class Tokens {
  private readonly secret: Uint8Array
  private readonly expiresIn: string

  // `@Value` cannot annotate a constructor parameter in this version, so the
  // env comes through ConfigService — which also keeps the class directly
  // constructible in tests via `new Tokens(new ConfigService())`.
  constructor(@Inject(ConfigService) config: ConfigService) {
    this.secret = new TextEncoder().encode(config.get('JWT_SECRET'))
    this.expiresIn = config.get('JWT_EXPIRES_IN')
  }

  async sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALG })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.secret)
  }

  /** Returns the subject, or null for any invalid token. Never throws. */
  async verify(token: string): Promise<string | null> {
    try {
      // Pinning algorithms rejects a token whose header claims `none` or an
      // asymmetric alg — the classic JWT confusion attack.
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: [ALG],
        // A token with no `exp` never expires. `sign()` always sets one, so
        // this turns a convention into a verification requirement — otherwise
        // anyone who can mint tokens can mint an immortal one.
        requiredClaims: ['exp'],
      })
      return typeof payload.sub === 'string' ? payload.sub : null
    } catch {
      return null
    }
  }
}
