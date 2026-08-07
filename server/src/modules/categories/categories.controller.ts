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
import type { CategoryResponse } from './categories.response'
import { createCategorySchema } from './dtos/create-category.dto'
import { updateCategorySchema } from './dtos/update-category.dto'
import { CreateCategoryUseCase } from './use-cases/create-category.use-case'
import { DeleteCategoryUseCase } from './use-cases/delete-category.use-case'
import { ListCategoriesUseCase } from './use-cases/list-categories.use-case'
import { ListCategoryTasksUseCase } from './use-cases/list-category-tasks.use-case'
import { UpdateCategoryUseCase } from './use-cases/update-category.use-case'

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
 *
 * One use case per operation, injected directly — there is no service layer in
 * between whose only job would be to forward five calls. Note what is NOT in
 * any signature below: `ownerId`. It is read from the request context inside
 * each use case (see `currentOwnerId`), so there is no chain of parameters for
 * one caller to get wrong.
 */
@Controller()
@ApiTags('Categories')
@ApiBearerAuth()
export class CategoriesController {
  @Autowired() private readonly listCategories!: ListCategoriesUseCase
  @Autowired() private readonly listCategoryTasks!: ListCategoryTasksUseCase
  @Autowired() private readonly createCategory!: CreateCategoryUseCase
  @Autowired() private readonly updateCategory!: UpdateCategoryUseCase
  @Autowired() private readonly deleteCategory!: DeleteCategoryUseCase

  @Get('/')
  // Annotated for the same reason as TasksController.list: `ctx.paginate` is
  // typed `Promise<RuntimeResponse>`, which erases the payload and leaves the
  // client unable to see `.data`.
  async list(ctx: Ctx): Promise<PaginatedResponse<CategoryResponse>> {
    return (await ctx.paginate(
      (parsed) => this.listCategories.execute(parsed),
      QUERY_CONFIG,
    )) as unknown as PaginatedResponse<CategoryResponse>
  }

  /**
   * The route lives here because the URL is category-shaped; the DATA is the
   * tasks module's, reached through TasksRepository in the use case. Reusing
   * TASK_QUERY_CONFIG rather than a second list means filter/sort/search names
   * are the same ones `/tasks` accepts — a client should not have to learn two
   * vocabularies for the same rows. Reusing the vocabulary also means reusing
   * the validation: the use case rejects unknown enum filter VALUES with the
   * same 422 `/tasks` gives, which it did not before.
   */
  @Get('/:id/tasks')
  async tasks(ctx: Ctx): Promise<PaginatedResponse<TaskResponse>> {
    return (await ctx.paginate(
      (parsed) => this.listCategoryTasks.execute(ctx.params.id, parsed),
      TASK_QUERY_CONFIG,
    )) as unknown as PaginatedResponse<TaskResponse>
  }

  @Post('/', { body: createCategorySchema, name: 'CreateCategory' })
  async create(ctx: Ctx) {
    return reply.created(await this.createCategory.execute(ctx.body))
  }

  @Put('/:id', { body: updateCategorySchema, name: 'UpdateCategory' })
  async update(ctx: Ctx) {
    return this.updateCategory.execute(ctx.params.id, ctx.body)
  }

  @Delete('/:id')
  async remove(ctx: Ctx) {
    await this.deleteCategory.execute(ctx.params.id)
    return reply.noContent()
  }
}
