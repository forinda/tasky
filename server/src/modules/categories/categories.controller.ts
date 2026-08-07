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
import { ApiBearerAuth, ApiTags } from '@forinda/kickjs-swagger'
import { TASK_QUERY_CONFIG } from '@/modules/tasks/tasks.constants'
import type { TaskResponse } from '@/modules/tasks/tasks.service'
import { CategoriesService, type CategoryResponse } from './categories.service'
import { createCategorySchema } from './dtos/create-category.dto'
import { updateCategorySchema } from './dtos/update-category.dto'

// Not `as const`: QueryFieldConfig declares mutable `string[]`, so a readonly
// tuple is not assignable. The framework's docs suggest `as const` for literal
// -union inference via FieldsOf, but nothing here depends on that union.
const QUERY_CONFIG = {
  sortable: ['name', 'createdAt', 'updatedAt'],
  searchable: ['name'],
}

/**
 * Class-level bearer security: every route here is protected. The inverse of
 * AuthController, where two of three routes are public and the annotation went
 * per-method.
 */
@Controller()
@ApiTags('Categories')
@ApiBearerAuth()
export class CategoriesController {
  @Autowired() private readonly categories!: CategoriesService

  @Get('/')
  // Annotated for the same reason as TasksController.list: `ctx.paginate` is
  // typed `Promise<RuntimeResponse>`, which erases the payload and leaves the
  // client unable to see `.data`.
  async list(ctx: Ctx): Promise<PaginatedResponse<CategoryResponse>> {
    // ownerId comes from the verified token, never from the body or a query
    // parameter. An owner id accepted from the request is not an owner id.
    const owner = ctx.require('currentUser')
    return (await ctx.paginate(
      (parsed) => this.categories.list(owner.id, parsed),
      QUERY_CONFIG,
    )) as unknown as PaginatedResponse<CategoryResponse>
  }

  /**
   * The route lives here because the URL is category-shaped; the DATA is the
   * tasks module's, reached through TasksRepository in the service. Reusing
   * TASK_QUERY_CONFIG rather than a second list means filter/sort/search names
   * are the same ones `/tasks` accepts — a client should not have to learn two
   * vocabularies for the same rows.
   *
   * ponytail: enum filter VALUES are not validated here, so
   * `?status=bogus` returns an empty page instead of the 422 `/tasks` gives.
   * Lift TasksService.assertKnownFilterValues out of that class if it bites.
   */
  @Get('/:id/tasks')
  async tasks(ctx: Ctx): Promise<PaginatedResponse<TaskResponse>> {
    const owner = ctx.require('currentUser')
    return (await ctx.paginate(
      (parsed) => this.categories.listTasks(owner.id, ctx.params.id, parsed),
      TASK_QUERY_CONFIG,
    )) as unknown as PaginatedResponse<TaskResponse>
  }

  @Post('/', { body: createCategorySchema, name: 'CreateCategory' })
  async create(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return reply.created(await this.categories.create(owner.id, ctx.body))
  }

  @Put('/:id', { body: updateCategorySchema, name: 'UpdateCategory' })
  async update(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return this.categories.update(ctx.params.id, owner.id, ctx.body)
  }

  @Delete('/:id')
  async remove(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    await this.categories.remove(ctx.params.id, owner.id)
    return reply.noContent()
  }
}
