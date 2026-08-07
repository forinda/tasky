import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface FieldProps extends Omit<ComponentProps<typeof Input>, 'id'> {
  id: string
  label: string
  error?: string
}

/**
 * A labelled input with its error message wired to it.
 *
 * The wiring is the point, and it is what call sites forget: `aria-invalid` so
 * the state is exposed, and `aria-describedby` pointing at the message so a
 * screen reader reads the reason rather than announcing an unexplained invalid
 * field. Doing it here means no form can ship half of it.
 */
export function Field({ id, label, error, className, ...props }: FieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="grid gap-1.5">
      {/* A real label, never a placeholder standing in for one — a placeholder
          disappears exactly when someone needs to check what they typed. */}
      <Label htmlFor={id}>{label}</Label>
      {/*
        No `border-destructive` here: `Input` already reddens its border from
        `aria-invalid`, and setting it a second time here was what made the
        focus ring invisible on an invalid field — the border was red before
        focus and red after, so focusing changed nothing visible.
      */}
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={className}
        {...props}
      />
      {error ? (
        <p id={errorId} className="type-meta text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
