import { describe, it, expect } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { SignJWT } from 'jose'
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
