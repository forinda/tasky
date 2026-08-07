import { Button } from '@/components/ui/button'
import { useUpdateCategory } from '@/features/categories/mutations'
import { CategoryForm } from './category-form'
import { taskCountLabel } from './labels'
import { DEFAULT_SWATCH, swatchLabel } from './swatches'

export interface CategoryListItem {
  id: string
  name: string
  color: string | null
}

interface CategoryRowProps {
  category: CategoryListItem
  /** `undefined` while the counts request is still in flight. */
  taskCount: number | undefined
  isEditing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
}

/**
 * A category's dot. Rendered from the stored value rather than a class, because
 * the colour is data — Tailwind cannot emit a class for a value it never sees
 * at build time.
 */
function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      // The label carries the colour name, so the dot is not the only thing
      // distinguishing two rows for anyone who cannot separate them by hue.
      role="img"
      aria-label={swatchLabel(color)}
      style={color ? { backgroundColor: color } : undefined}
      className={
        'size-3 shrink-0 rounded-full ' +
        // A category created through the API without a colour still needs a
        // dot, or its row sits a few pixels left of every other row.
        (color ? '' : 'border border-border')
      }
    />
  )
}

export function CategoryRow({
  category,
  taskCount,
  isEditing,
  onEdit,
  onCancelEdit,
  onDelete,
}: CategoryRowProps) {
  const update = useUpdateCategory()

  if (isEditing) {
    return (
      <li className="border-b border-border p-4 last:border-b-0">
        <CategoryForm
          initialName={category.name}
          initialColor={category.color ?? DEFAULT_SWATCH}
          submitLabel="Save"
          pending={update.isPending}
          error={update.error}
          onCancel={() => {
            // Clear the failure with the form. Reopening the row to find last
            // attempt's "name already exists" still under a name the user has
            // not typed yet reads as a fresh error.
            update.reset()
            onCancelEdit()
          }}
          onSubmit={({ name, color }) =>
            update.mutate(
              { id: category.id, name, color },
              { onSuccess: onCancelEdit },
            )
          }
        />
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 border-b border-border p-4 last:border-b-0">
      <ColorDot color={category.color} />
      <span className="type-body min-w-0 flex-1 truncate font-medium text-foreground">
        {category.name}
      </span>
      {taskCount === undefined ? null : (
        <span className="type-meta shrink-0 text-muted-foreground">
          {taskCountLabel(taskCount)}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {/* Named for the row they act on. Two rows of bare "Rename" buttons are
            indistinguishable to a screen reader reading the button list. */}
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Rename<span className="sr-only"> {category.name}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete<span className="sr-only"> {category.name}</span>
        </Button>
      </div>
    </li>
  )
}
