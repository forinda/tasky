import { z } from 'zod'
import { TASK_STATUSES } from '@/db/schema'

export const moveTaskSchema = z.object({
  // Omitted means "same column". A client that just dropped a card knows which
  // column it landed in, not whether that was a change, so sending the current
  // status is normal and not an error.
  status: z.enum(TASK_STATUSES).optional(),
  // The task this one lands directly BELOW; `null` is the top of the column.
  // Required rather than optional-with-a-default: an empty body would otherwise
  // silently mean "move to the top", and a client bug that drops the field
  // would reorder the board instead of failing.
  //
  // Not a raw position number: the client would have to know the neighbours'
  // floats and would race anyone else's move. An id is stable, and it lets the
  // server pick the midpoint — and rebalance when there is no room left.
  afterId: z.string().min(1).nullable(),
})

export type MoveTaskDTO = z.infer<typeof moveTaskSchema>
