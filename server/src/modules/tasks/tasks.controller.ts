import { Autowired, Controller, Delete, Get, Post, Put, reply, type Ctx } from '@forinda/kickjs'
import { ApiBearerAuth, ApiTags } from '@forinda/kickjs-swagger'
import { createTaskSchema } from './dtos/create-task.dto'
import { updateTaskSchema } from './dtos/update-task.dto'
import { TASK_QUERY_CONFIG } from './tasks.constants'
import { TasksService } from './tasks.service'

/** Class-level bearer security: every route here is protected. */
@Controller()
@ApiTags('Tasks')
@ApiBearerAuth()
export class TasksController {
  @Autowired() private readonly tasks!: TasksService

  @Get('/')
  async list(ctx: Ctx) {
    // ownerId comes from the verified token, never from the body or a query
    // parameter. An owner id accepted from the request is not an owner id.
    const owner = ctx.require('currentUser')
    return ctx.paginate((parsed) => this.tasks.list(owner.id, parsed), TASK_QUERY_CONFIG)
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
