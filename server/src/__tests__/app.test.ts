import { describe, it, expect } from 'vitest'
import { app } from '../index'

describe('application entry', () => {
  it('exports a bootstrapped app', () => {
    expect(app).toBeDefined()
  })

  it('has run its migrations, so schema tables exist', async () => {
    const { Database } = await import('../db/database')
    const database = app.getContainer().resolve(Database)

    const names = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>

    const tableNames = names.map((r) => r.name)

    expect(tableNames).toContain('users')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('categories')
    expect(tableNames).toContain('task_categories')
  })

  it('closes the database connection on shutdown', async () => {
    const { Database } = await import('../db/database')
    const database = app.getContainer().resolve(Database)

    await app.shutdown()

    // better-sqlite3's actual message is "The database connection is not
    // open" — no literal "closed" — so the assertion matches what the
    // driver really throws rather than the brief's guessed wording.
    expect(() => database.connection.prepare('SELECT 1').get()).toThrow(/not open/i)
  })
})
