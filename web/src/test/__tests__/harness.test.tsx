import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../render'
import { db, makeTask } from '../handlers'
import { Board } from '@/routes/board'

/**
 * Tests the test harness, which sounds circular and is not: every other file in
 * this suite is only as trustworthy as these four facts. This project has had
 * eight separate occasions where a check reported "clean" because the
 * instrument was broken, so the instrument gets its own tests.
 */
describe('the harness', () => {
  it('serves seeded data through MSW, not a real API', async () => {
    db.tasks.push(makeTask({ title: 'Seeded from the mock db' }))

    render(<Board />, { route: '/app' })

    // If MSW were not intercepting, this request would go to the dev proxy —
    // passing on a machine with a server running and failing everywhere else.
    expect(await screen.findByText('Seeded from the mock db')).toBeInTheDocument()
  })

  it('starts each test with an empty database', async () => {
    render(<Board />, { route: '/app' })

    // The previous test pushed a task. If `resetDb()` were not running in
    // afterEach, it would still be here and this suite would pass or fail by
    // file order.
    await waitFor(() => expect(screen.getAllByText(/Nothing here yet/i).length).toBeGreaterThan(0))
    expect(screen.queryByText('Seeded from the mock db')).not.toBeInTheDocument()
  })

  it('renders inside the real providers, so the session resolves', async () => {
    render(<Board />, { route: '/app' })

    // The board only reaches its loaded state if the query client, the router,
    // and the boot session exchange are all present.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument())
  })

  it('gives each test its own query cache', async () => {
    db.tasks.push(makeTask({ title: 'First render only' }))
    const first = render(<Board />, { route: '/app' })
    expect(await screen.findByText('First render only')).toBeInTheDocument()
    first.unmount()

    db.tasks = []
    render(<Board />, { route: '/app' })
    // A shared client would serve the cached list here and this would still pass
    // with stale data.
    await waitFor(() => expect(screen.queryByText('First render only')).not.toBeInTheDocument())
  })
})
