import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocked before importing LoginUseCase so the module-load DUMMY_HASH uses it too.
vi.mock('../password', () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
  verifyPassword: vi.fn(async () => false),
}))

// The use case reaches the database through plain query functions, so the
// database itself is stubbed out at that seam rather than with a repository.
vi.mock('../auth.queries', () => ({
  findUserByEmail: vi.fn(async () => null),
  issueSession: vi.fn(async () => ({ rowId: 'row-1' })),
}))

const { hashPassword, verifyPassword } = await import('../password')
const { findUserByEmail } = await import('../auth.queries')
const { LoginUseCase } = await import('../login.use-case')

/**
 * The enumeration defence is "both branches do the same work". Asserting that
 * structurally rather than by wall-clock, because a timing assertion is flaky
 * under CI load — but the flaw this guards was real: the miss branch used to
 * run two scrypt calls to the hit branch's one, making unknown emails
 * measurably slower (37ms vs 58ms when audited).
 */
describe('login does equal work on both branches', () => {
  // Neither collaborator is reached: both cases fail before a session is
  // issued. The constructor needs them either way.
  const database = {} as never
  const tokens = {} as never

  beforeEach(() => {
    vi.mocked(hashPassword).mockClear()
    vi.mocked(verifyPassword).mockClear()
  })

  it('calls verifyPassword exactly once and hashPassword never — known email', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({ id: 'u1', passwordHash: 'stored' } as never)
    const useCase = new LoginUseCase(database, tokens)

    await expect(useCase.execute({ email: 'known@example.com', password: 'x' })).rejects.toThrow()

    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(hashPassword)).not.toHaveBeenCalled()
  })

  it('calls verifyPassword exactly once and hashPassword never — unknown email', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)
    const useCase = new LoginUseCase(database, tokens)

    await expect(useCase.execute({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow()

    // The old code called hashPassword here, and only here. That asymmetry
    // was the oracle.
    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(hashPassword)).not.toHaveBeenCalled()
  })
})
