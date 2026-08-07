import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SWATCHES } from './swatches'
// Named for the feature that first needed it, but it parses THIS server's error
// envelope, not an auth-specific one: `422 { message, errors: [{field, message}] }`
// and `{ message }` for everything else. A duplicate name comes back 409
// `{ message: 'A category with that name already exists' }`, which falls
// straight through to `form` — so the duplicate case reads as itself rather
// than as "Something went wrong". Reused rather than copied; a second parser
// would be sixty lines that drift out of step with the first.
import { parseAuthError } from '@/features/auth/errors'

export interface CategoryFormValues {
  name: string
  color: string
}

interface CategoryFormProps {
  initialName?: string
  initialColor: string
  /** "Add category" when creating, "Save" when renaming. */
  submitLabel: string
  pending: boolean
  /** The rejected mutation, unparsed. `null` while nothing has failed. */
  error: unknown
  onSubmit: (values: CategoryFormValues) => void
  onCancel: () => void
}

/**
 * One form behind both the inline create row and the inline rename row.
 *
 * Two near-identical forms drift apart within a story or two and then only one
 * of them gets the next fix — the same reasoning that keeps TaskSheet's create
 * and edit on one form.
 */
export function CategoryForm({
  initialName = '',
  initialColor,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)

  // Unique per mounted form. The create row and every rename row can be on the
  // page at once, and duplicated ids would point every `<label for>` at the
  // first input — clicking one row's label would focus another's.
  const fieldId = useId()
  const nameId = `${fieldId}-name`
  const errorId = `${fieldId}-error`
  const radioGroup = `${fieldId}-color`

  const parsed = parseAuthError(error)
  // A 422 attaches its message to `name`, the only field this form has; a 409
  // has no field at all. Showing whichever exists puts one message in one place
  // instead of the same text twice.
  const message = error ? (parsed.fields.name ?? parsed.form) : null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, color })
  }

  return (
    <form
      onSubmit={handleSubmit}
      // Escape cancels. An inline editor with no way out but the mouse traps
      // anyone working from the keyboard on a row they opened by accident.
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
      className="grid gap-3"
    >
      <div className="grid gap-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          autoFocus
          maxLength={120}
          required
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* A fieldset because these radios are one control, and its legend is the
          group's accessible name. Native radios rather than buttons with
          aria-checked: arrow-key navigation and the roving tab stop come free
          and correct, which a hand-rolled version reliably gets wrong. */}
      <fieldset className="grid gap-1.5">
        <legend className="type-meta mb-1.5 font-medium text-foreground">Colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((swatch) => (
            <label key={swatch.value} className="cursor-pointer">
              <input
                type="radio"
                name={radioGroup}
                value={swatch.value}
                checked={color.toLowerCase() === swatch.value.toLowerCase()}
                onChange={() => setColor(swatch.value)}
                className="peer sr-only"
              />
              {/* The one place a category colour is painted from data. The hex
                  comes from SWATCHES, which is the sole hex authority. */}
              <span
                aria-hidden
                style={{ backgroundColor: swatch.value }}
                className="block size-6 rounded-full ring-offset-2 ring-offset-background transition-all peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
              />
              <span className="sr-only">{swatch.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {message ? (
        <p id={errorId} role="alert" className="type-meta text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
