import { describe, it, expect } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { SignJWT } from 'jose'
import { createHmac } from 'node:crypto'
import { Tokens } from '../tokens'

function makeTokens(): Tokens {
  return new Tokens(new ConfigService())
}

describe('Tokens', () => {
  it('round-trips a subject', async () => {
    const tokens = makeTokens()
    const token = await tokens.sign('user-1')
    expect(await tokens.verify(token)).toBe('user-1')
  })

  it('rejects a token signed with a different secret', async () => {
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('a-completely-different-secret-32-chars'))

    expect(await makeTokens().verify(foreign)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const tokens = makeTokens()
    const secret = new TextEncoder().encode(new ConfigService().get('JWT_SECRET'))
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret)

    expect(await tokens.verify(expired)).toBeNull()
  })

  it('rejects garbage without throwing', async () => {
    const tokens = makeTokens()
    expect(await tokens.verify('not.a.jwt')).toBeNull()
    expect(await tokens.verify('')).toBeNull()
  })
})

/**
 * Forged by hand rather than with `jose`, deliberately: jose's key-length guard
 * may refuse to sign HS512 with this secret, and the test would then fail for
 * the wrong reason — looking like the pin works when nothing was tested.
 */
function forge(secret: string, header: object, payload: object): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const h = b64(header)
  const p = b64(payload)
  const alg = (header as { alg: string }).alg === 'HS512' ? 'sha512' : 'sha256'
  const sig = createHmac(alg, secret).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${sig}`
}

describe('Tokens — verification hardening', () => {
  const secret = () => new ConfigService().get('JWT_SECRET')
  const now = () => Math.floor(Date.now() / 1000)

  it('rejects a token whose header claims a different algorithm', async () => {
    // Signed with the REAL secret. Only `algorithms: ['HS256']` rejects this.
    const forged = forge(
      secret(),
      { alg: 'HS512', typ: 'JWT' },
      { sub: 'user-1', iat: now(), exp: now() + 3600 },
    )

    expect(await makeTokens().verify(forged)).toBeNull()
  })

  it('rejects a token with no expiry claim', async () => {
    const immortal = forge(secret(), { alg: 'HS256', typ: 'JWT' }, { sub: 'user-1', iat: now() })

    expect(await makeTokens().verify(immortal)).toBeNull()
  })

  it('still accepts a correctly formed token', async () => {
    // Control: proves the two rejections above are about alg and exp, not
    // about hand-forging breaking something incidental.
    const good = forge(
      secret(),
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'user-1', iat: now(), exp: now() + 3600 },
    )

    expect(await makeTokens().verify(good)).toBe('user-1')
  })
})
