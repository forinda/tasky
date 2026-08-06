import { Autowired, Controller, Delete, Get, Post, Put, reply, type Ctx } from '@forinda/kickjs'
import { ApiBearerAuth, ApiTags } from '@forinda/kickjs-swagger'
import { CategoriesService } from './categories.service'
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
  async list(ctx: Ctx) {
    // ownerId comes from the verified token, never from the body or a query
    // parameter. An owner id accepted from the request is not an owner id.
    const owner = ctx.require('currentUser')
    return ctx.paginate((parsed) => this.categories.list(owner.id, parsed), QUERY_CONFIG)
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
