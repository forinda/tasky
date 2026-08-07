import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocked before importing AuthService so the module-load DUMMY_HASH uses it too.
vi.mock('../password', () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
  verifyPassword: vi.fn(async () => false),
}))

const { hashPassword, verifyPassword } = await import('../password')
const { AuthService } = await import('../auth.service')

/**
 * The enumeration defence is "both branches do the same work". Asserting that
 * structurally rather than by wall-clock, because a timing assertion is flaky
 * under CI load — but the flaw this guards was real: the miss branch used to
 * run two scrypt calls to the hit branch's one, making unknown emails
 * measurably slower (37ms vs 58ms when audited).
 */
describe('login does equal work on both branches', () => {
  const tokens = {
    signAccess: vi.fn(async () => 'tok'),
    mintRefresh: vi.fn(() => ({ token: 'r', hash: 'h', expiresAt: new Date(Date.now() + 1000) })),
  } as never
  // The login path stores a refresh token on success. Both cases here fail
  // before that point, but the constructor needs the collaborator either way.
  const refreshTokens = { create: vi.fn(async () => ({ id: 'row-1' })) } as never

  beforeEach(() => {
    vi.mocked(hashPassword).mockClear()
    vi.mocked(verifyPassword).mockClear()
  })

  it('calls verifyPassword exactly once and hashPassword never — known email', async () => {
    const users = {
      findByEmail: async () => ({ id: 'u1', passwordHash: 'stored' }),
    } as never
    const service = new AuthService(users, tokens, refreshTokens)

    await expect(
      service.login({ email: 'known@example.com', password: 'x' }),
    ).rejects.toThrow()

    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(hashPassword)).not.toHaveBeenCalled()
  })

  it('calls verifyPassword exactly once and hashPassword never — unknown email', async () => {
    const users = { findByEmail: async () => null } as never
    const service = new AuthService(users, tokens, refreshTokens)

    await expect(
      service.login({ email: 'nobody@example.com', password: 'x' }),
    ).rejects.toThrow()

    // The old code called hashPassword here, and only here. That asymmetry
    // was the oracle.
    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(hashPassword)).not.toHaveBeenCalled()
  })
})
