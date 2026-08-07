import {
  Autowired,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  reply,
  type Ctx,
  type PaginatedResponse,
} from '@forinda/kickjs'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@forinda/kickjs-swagger'
import { createTaskSchema } from './dtos/create-task.dto'
import { updateTaskSchema } from './dtos/update-task.dto'
import { TASK_QUERY_CONFIG } from './tasks.constants'
import { TasksService, type TaskResponse } from './tasks.service'

/** Class-level bearer security: every route here is protected. */
@Controller()
@ApiTags('Tasks')
@ApiBearerAuth()
export class TasksController {
  @Autowired() private readonly tasks!: TasksService

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
    // ownerId comes from the verified token, never from the body or a query
    // parameter. An owner id accepted from the request is not an owner id.
    const owner = ctx.require('currentUser')
    return (await ctx.paginate(
      (parsed) => this.tasks.list(owner.id, parsed),
      TASK_QUERY_CONFIG,
    )) as unknown as PaginatedResponse<TaskResponse>
  }

  // BEFORE '/:id', or the param route matches first and 'grouped' is read as a
  // task id — a 404 that looks like a missing row rather than a routing bug.
  @Get('/grouped')
  @ApiOperation({
    description:
      'Board view, not paginated. A task in several categories appears in each of those columns, and the 500 cap counts joined rows, so each of those links spends one.',
  })
  async grouped(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return this.tasks.grouped(owner.id)
  }

  @Get('/:id')
  async get(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return this.tasks.get(ctx.params.id, owner.id)
  }

  @Post('/', { body: createTaskSchema, name: 'CreateTask' })
  async create(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return reply.created(await this.tasks.create(owner.id, ctx.body))
  }

  @Put('/:id', { body: updateTaskSchema, name: 'UpdateTask' })
  async update(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return this.tasks.update(ctx.params.id, owner.id, ctx.body)
  }

  @Delete('/:id')
  async remove(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    await this.tasks.remove(ctx.params.id, owner.id)
    return reply.noContent()
  }
}
