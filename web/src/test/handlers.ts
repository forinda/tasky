import { http, HttpResponse } from 'msw'

/**
 * The API's real shapes, as the server actually emits them.
 *
 * Verified against the running server rather than guessed — the envelope is
 * `{ data, meta }` from shared/pagination.ts, validation failures are
 * `422 { message, errors: [{ field, message }] }`, and a rejected login is
 * `401 { message }`. A handler that returns a shape the server does not is a
 * test that passes while the app is broken, which is the specific failure this
 * suite exists to prevent.
 */

export interface MockTask {
  id: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'in_progress' | 'done'
  categoryIds: string[]
  position: number
  createdAt: string
  updatedAt: string
}

export interface MockCategory {
  id: string
  name: string
  color: string | null
  createdAt: string
  updatedAt: string
}

/** Mutable per-test state. `resetDb()` runs before each test in setup.ts. */
export const db = {
  tasks: [] as MockTask[],
  categories: [] as MockCategory[],
  /** Set to make the next refresh fail, i.e. "signed out". */
  sessionValid: true,
}

export function resetDb() {
  db.tasks = []
  db.categories = []
  db.sessionValid = true
}

export function makeTask(overrides: Partial<MockTask> = {}): MockTask {
  const now = new Date().toISOString()
  return {
    id: `task-${Math.random().toString(36).slice(2, 9)}`,
    title: 'A task',
    description: null,
    priority: 'medium',
    status: 'todo',
    categoryIds: [],
    position: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function makeCategory(overrides: Partial<MockCategory> = {}): MockCategory {
  const now = new Date().toISOString()
  return {
    id: `cat-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Engineering',
    color: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const USER = { id: 'user-1', email: 'ada@example.com', name: 'Ada' }

function paginated<T>(rows: T[]) {
  return {
    data: rows,
    meta: {
      page: 1,
      limit: 100,
      total: rows.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  }
}

/**
 * Applies the filters the real server applies, because the board's correctness
 * depends on them. A handler that ignores `?filter=` would make every
 * filter-chip test pass regardless of whether the client sent anything.
 */
function applyFilters(tasks: MockTask[], url: URL): MockTask[] {
  const filters = url.searchParams.getAll('filter')
  const q = url.searchParams.get('q')

  let rows = tasks
  for (const filter of filters) {
    const [field, operator, value] = filter.split(':')
    // The server 422s any operator but `eq`; mirroring that here keeps a client
    // bug from looking like a passing test.
    if (operator !== 'eq') {
      throw HttpResponse.json(
        { message: `Unsupported operator '${operator}' for ${field}. Only 'eq' is supported.` },
        { status: 422 },
      )
    }
    if (field === 'status') rows = rows.filter((t) => t.status === value)
    if (field === 'priority') rows = rows.filter((t) => t.priority === value)
    if (field === 'categoryId') rows = rows.filter((t) => t.categoryIds.includes(value))
  }

  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.description ?? '').toLowerCase().includes(needle),
    )
  }

  // Position order within a status, which is what the server returns when a
  // status filter is present — the board's drop handler reads this order.
  return [...rows].sort((a, b) => a.position - b.position)
}

export const handlers = [
  http.post('/api/v1/auth/refresh', () =>
    db.sessionValid
      ? HttpResponse.json({ user: USER, accessToken: 'access-token' })
      : HttpResponse.json({ message: 'Invalid or expired session' }, { status: 401 }),
  ),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password === 'wrong') {
      // Identical message for unknown email and wrong password — the server
      // does not distinguish them and neither may this.
      return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 })
    }
    db.sessionValid = true
    return HttpResponse.json({ user: { ...USER, email: body.email }, accessToken: 'access-token' })
  }),

  http.post('/api/v1/auth/signup', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string; name: string }
    const errors: Array<{ field: string; message: string }> = []
    if (!body.name) errors.push({ field: 'name', message: 'Enter your name' })
    if (!body.email?.includes('@')) {
      errors.push({ field: 'email', message: 'Enter a valid email address' })
    }
    if ((body.password ?? '').length < 8) {
      errors.push({ field: 'password', message: 'Use at least 8 characters' })
    }
    if (errors.length > 0) {
      return HttpResponse.json({ message: errors[0].message, errors }, { status: 422 })
    }
    db.sessionValid = true
    return HttpResponse.json({ user: { ...USER, ...body }, accessToken: 'access-token' }, { status: 201 })
  }),

  http.post('/api/v1/auth/logout', () => {
    db.sessionValid = false
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/auth/me', () =>
    db.sessionValid
      ? HttpResponse.json(USER)
      : HttpResponse.json({ message: 'Not signed in' }, { status: 401 }),
  ),

  http.get('/api/v1/categories', () => HttpResponse.json(paginated(db.categories))),

  http.get('/api/v1/tasks/grouped', () => {
    const columns = db.categories.map((category) => ({
      category,
      tasks: db.tasks.filter((t) => t.categoryIds.includes(category.id)),
    }))
    columns.push({
      category: null as unknown as MockCategory,
      tasks: db.tasks.filter((t) => t.categoryIds.length === 0),
    })
    return HttpResponse.json({ columns, truncated: false })
  }),

  http.get('/api/v1/tasks', ({ request }) => {
    try {
      return HttpResponse.json(paginated(applyFilters(db.tasks, new URL(request.url))))
    } catch (response) {
      // `applyFilters` throws a Response for a bad operator, mirroring the 422.
      if (response instanceof HttpResponse) return response
      throw response
    }
  }),

  http.get('/api/v1/tasks/:id', ({ params }) => {
    const task = db.tasks.find((t) => t.id === params.id)
    // A missing task and someone else's are the same 404 with the same body.
    return task
      ? HttpResponse.json(task)
      : HttpResponse.json({ message: 'Task not found' }, { status: 404 })
  }),

  http.post('/api/v1/tasks', async ({ request }) => {
    const body = (await request.json()) as Partial<MockTask>
    if (!body.title?.trim()) {
      return HttpResponse.json(
        { message: 'Enter a title', errors: [{ field: 'title', message: 'Enter a title' }] },
        { status: 422 },
      )
    }
    // New work lands at the top of its column, as the server does.
    const top = Math.min(0, ...db.tasks.map((t) => t.position)) - 1
    const task = makeTask({ ...body, position: top })
    db.tasks.push(task)
    return HttpResponse.json(task, { status: 201 })
  }),

  http.put('/api/v1/tasks/:id', async ({ params, request }) => {
    const body = (await request.json()) as Partial<MockTask>
    const task = db.tasks.find((t) => t.id === params.id)
    if (!task) return HttpResponse.json({ message: 'Task not found' }, { status: 404 })
    Object.assign(task, body, { updatedAt: new Date().toISOString() })
    return HttpResponse.json(task)
  }),

  http.patch('/api/v1/tasks/:id/position', async ({ params, request }) => {
    const body = (await request.json()) as { status?: MockTask['status']; afterId: string | null }
    const task = db.tasks.find((t) => t.id === params.id)
    if (!task) return HttpResponse.json({ message: 'Task not found' }, { status: 404 })

    if (body.status) task.status = body.status
    const column = db.tasks
      .filter((t) => t.status === task.status && t.id !== task.id)
      .sort((a, b) => a.position - b.position)

    // The midpoint rule, so a test can assert ordering rather than a magic float.
    if (body.afterId === null) {
      task.position = (column[0]?.position ?? 0) - 1
    } else {
      const index = column.findIndex((t) => t.id === body.afterId)
      const prev = column[index]
      const next = column[index + 1]
      task.position = next ? (prev.position + next.position) / 2 : prev.position + 1
    }
    return HttpResponse.json(task)
  }),

  http.delete('/api/v1/tasks/:id', ({ params }) => {
    db.tasks = db.tasks.filter((t) => t.id !== params.id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/v1/categories', async ({ request }) => {
    const body = (await request.json()) as { name: string; color?: string | null }
    if (db.categories.some((c) => c.name === body.name)) {
      return HttpResponse.json({ message: 'Category already exists' }, { status: 409 })
    }
    const category = makeCategory(body)
    db.categories.push(category)
    return HttpResponse.json(category, { status: 201 })
  }),

  http.put('/api/v1/categories/:id', async ({ params, request }) => {
    const body = (await request.json()) as Partial<MockCategory>
    const category = db.categories.find((c) => c.id === params.id)
    if (!category) return HttpResponse.json({ message: 'Category not found' }, { status: 404 })
    Object.assign(category, body)
    return HttpResponse.json(category)
  }),

  http.delete('/api/v1/categories/:id', ({ params }) => {
    db.categories = db.categories.filter((c) => c.id !== params.id)
    // Tasks survive; only their links go.
    for (const task of db.tasks) {
      task.categoryIds = task.categoryIds.filter((id) => id !== params.id)
    }
    return new HttpResponse(null, { status: 204 })
  }),
]
