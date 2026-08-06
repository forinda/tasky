import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('password hashing', () => {
  it('produces a verifiable hash', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false)
  })

  it('never stores the plaintext', async () => {
    const stored = await hashPassword('hunter2')
    expect(stored).not.toContain('hunter2')
  })

  it('salts — the same password hashes differently every time', async () => {
    const a = await hashPassword('same')
    const b = await hashPassword('same')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same', a)).toBe(true)
    expect(await verifyPassword('same', b)).toBe(true)
  })

  it('returns false rather than throwing on a malformed stored value', async () => {
    expect(await verifyPassword('x', 'not-a-real-hash')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$zzz$zzz')).toBe(false)
  })
})

describe('password hash format carries its cost parameters', () => {
  it('writes N, r and p into the stored value', async () => {
    const stored = await hashPassword('hunter2hunter2')
    const parts = stored.split('$')

    expect(parts).toHaveLength(6)
    expect(parts[0]).toBe('scrypt')
    expect(Number(parts[1])).toBeGreaterThan(1)
  })

  it('still verifies a legacy 3-segment hash', async () => {
    // Written by the previous implementation, which used N=16384, r=8, p=1.
    const { scrypt, randomBytes } = await import('node:crypto')
    const { promisify } = await import('node:util')
    const derive = promisify(scrypt) as (
      p: string,
      s: Buffer,
      k: number,
      o: { N: number; r: number; p: number },
    ) => Promise<Buffer>

    const salt = randomBytes(32)
    const digest = await derive('legacy-password', salt, 64, { N: 16384, r: 8, p: 1 })
    const legacy = `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`

    expect(await verifyPassword('legacy-password', legacy)).toBe(true)
    expect(await verifyPassword('wrong', legacy)).toBe(false)
  })

  it('verifies a hash made with DIFFERENT cost parameters', async () => {
    // The case that actually proves the parameters are read from the value
    // rather than the module constants — raising N must not lock anyone out.
    const { scrypt, randomBytes } = await import('node:crypto')
    const { promisify } = await import('node:util')
    const derive = promisify(scrypt) as (
      p: string,
      s: Buffer,
      k: number,
      o: { N: number; r: number; p: number },
    ) => Promise<Buffer>

    const cost = { N: 4096, r: 8, p: 1 }
    const salt = randomBytes(32)
    const digest = await derive('other-cost', salt, 64, cost)
    const stored = `scrypt$${cost.N}$${cost.r}$${cost.p}$${salt.toString('hex')}$${digest.toString('hex')}`

    expect(await verifyPassword('other-cost', stored)).toBe(true)
  })

  it('returns false rather than throwing on absurd stored parameters', async () => {
    expect(await verifyPassword('x', 'scrypt$notanumber$8$1$aa$bb')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$1$2$3$4$5$6$7')).toBe(false)
  })
})
