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
