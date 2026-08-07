import { randomUUID } from 'node:crypto'
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { TaskPriority, TaskStatus } from './enums'
import { timestamps } from './timestamps'
import { users } from './users'

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    // A user's tasks have independent value — deleting the owning user must
    // fail loudly rather than silently destroying their tasks. IDs are UUIDs
    // and aren't expected to change, so onUpdate cascade is a safety net,
    // not a workflow: if one is ever rewritten, references follow instead
    // of breaking.
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    // SQLite has no enum. $type<> gives the compile-time union; the Zod
    // request schemas enforce it at the boundary.
    priority: text('priority').$type<TaskPriority>().notNull().default('medium'),
    status: text('status').$type<TaskStatus>().notNull().default('todo'),
    // Where the task sits in its board column — ordered within (ownerId,
    // status), meaningless across columns. A FRACTIONAL index: REAL, not an
    // integer rank, so dropping a card between two neighbours is one UPDATE to
    // (prev + next) / 2 instead of renumbering everything below it. The cost is
    // that halving a gap ~50 times exhausts double precision, so the repository
    // renumbers a bucket when the gap it would split gets too small.
    //
    // The default is inert: every insert path computes min - 1 (new work lands
    // at the top of its column). It exists so the ALTER TABLE that added this
    // column to an existing database had something to write; the migration then
    // backfills real values from created_at, because leaving every old row on 0
    // would leave their order undefined.
    position: real('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('tasks_owner_idx').on(t.ownerId)],
)

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
