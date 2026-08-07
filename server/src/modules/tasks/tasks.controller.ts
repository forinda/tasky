import {
  Autowired,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  reply,
  type Ctx,
  type PaginatedResponse,
} from '@forinda/kickjs'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@forinda/kickjs-swagger'
import { createTaskSchema } from './dtos/create-task.dto'
import { moveTaskSchema } from './dtos/move-task.dto'
import { updateTaskSchema } from './dtos/update-task.dto'
import { TASK_QUERY_CONFIG } from './tasks.constants'
import type { TaskResponse } from './tasks.types'
import { CreateTaskUseCase } from './use-cases/create-task.use-case'
import { DeleteTaskUseCase } from './use-cases/delete-task.use-case'
import { GetTaskUseCase } from './use-cases/get-task.use-case'
import { GroupTasksUseCase } from './use-cases/group-tasks.use-case'
import { ListTasksUseCase } from './use-cases/list-tasks.use-case'
import { MoveTaskPositionUseCase } from './use-cases/move-task-position.use-case'
import { UpdateTaskUseCase } from './use-cases/update-task.use-case'

/**
 * Class-level bearer security: every route here is protected.
 *
 * No route reads `currentUser` and no route passes an owner id: the use cases
 * take it from the request context themselves. An owner id that never appears
 * in a signature is an owner id no handler can forget to pass, pass twice, or
 * pass from the wrong place — the body and the query string being the two
 * wrong places that matter.
 */
@Controller()
@ApiTags('Tasks')
@ApiBearerAuth()
export class TasksController {
  @Autowired() private readonly listTasks!: ListTasksUseCase
  @Autowired() private readonly getTask!: GetTaskUseCase
  @Autowired() private readonly groupTasks!: GroupTasksUseCase
  @Autowired() private readonly createTask!: CreateTaskUseCase
  @Autowired() private readonly updateTask!: UpdateTaskUseCase
  @Autowired() private readonly moveTaskPosition!: MoveTaskPositionUseCase
  @Autowired() private readonly deleteTask!: DeleteTaskUseCase

  /**
   * The return type is annotated because `ctx.paginate` is declared
   * `Promise<RuntimeResponse>` — it erases the payload type, so every paginated
   * route reached `kick typegen` as an opaque blob and the client could not see
   * `.data` at all.
   *
   * Declaring the envelope here fixes it for every consumer at once, which is
   * the right place: the server is what knows the shape. The cast is the narrow
   * part — `paginate` really does emit exactly this.
   */
  @Get('/')
  async list(ctx: Ctx): Promise<PaginatedResponse<TaskResponse>> {
    return (await ctx.paginate(
      (parsed) => this.listTasks.execute(parsed),
      TASK_QUERY_CONFIG,
    )) as unknown as PaginatedResponse<TaskResponse>
  }

  // BEFORE '/:id', or the param route matches first and 'grouped' is read as a
  // task id — a 404 that looks like a missing row rather than a routing bug.
  @Get('/grouped')
  @ApiOperation({
    description:
      'Board view, not paginated: `{ columns, truncated }`. A task in several categories appears in each of those columns, and the cap counts joined rows, so each of those links spends one. `truncated` says whether the cap was hit — the client never needs to know the number.',
  })
  async grouped() {
    return this.groupTasks.execute()
  }

  @Get('/:id')
  async get(ctx: Ctx) {
    return this.getTask.execute(ctx.params.id)
  }

  @Post('/', { body: createTaskSchema, name: 'CreateTask' })
  async create(ctx: Ctx) {
    return reply.created(await this.createTask.execute(ctx.body))
  }

  @Put('/:id', { body: updateTaskSchema, name: 'UpdateTask' })
  async update(ctx: Ctx) {
    return this.updateTask.execute(ctx.params.id, ctx.body)
  }

  @Patch('/:id/position', { body: moveTaskSchema, name: 'MoveTask' })
  @ApiOperation({
    description:
      'Reorder a task inside its column, or move it to another one. `afterId` names the task it lands directly below; null is the top. Positions are fractional, so this is a single row update.',
  })
  async move(ctx: Ctx) {
    return this.moveTaskPosition.execute(ctx.params.id, ctx.body)
  }

  @Delete('/:id')
  async remove(ctx: Ctx) {
    await this.deleteTask.execute(ctx.params.id)
    return reply.noContent()
  }
}
