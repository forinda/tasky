'use client'

import * as React from 'react'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'

import { cn } from '@/lib/utils'

export interface ComboboxItem {
  readonly value: string
  readonly label: string
  /** Optional secondary line, smaller, under `label`. */
  readonly description?: string
  readonly disabled?: boolean
}

interface BaseProps {
  readonly items: ReadonlyArray<ComboboxItem>
  readonly placeholder?: string
  readonly searchPlaceholder?: string
  readonly emptyMessage?: string
  /**
   * Rendered under `emptyMessage` — a way out of a dead-end list ("Create
   * category") without leaving the flow. Same rule as EmptyState: an empty
   * result is an invitation to act.
   */
  readonly emptyAction?: React.ReactNode
  readonly disabled?: boolean
  readonly className?: string
  readonly triggerClassName?: string
  readonly contentClassName?: string
  /** For assistive tech when there is no visible <label>. */
  readonly 'aria-label'?: string
  /** Forwarded to the trigger so a <Label htmlFor> can point at it. */
  readonly id?: string
}

interface SingleProps extends BaseProps {
  readonly multi?: false
  readonly value: string | null
  readonly onChange: (value: string | null) => void
}

interface MultiProps extends BaseProps {
  readonly multi: true
  readonly value: ReadonlyArray<string>
  readonly onChange: (value: string[]) => void
}

/**
 * A discriminated union, so the two modes cannot be mixed up: `multi` changes
 * both the value type and the callback signature together. Passing a `string[]`
 * to the single-select form, or forgetting `multi` while handing it an array,
 * is a compile error rather than a runtime surprise.
 */
export type ComboboxProps = SingleProps | MultiProps

/**
 * A select you can type into. Radix Popover for focus management plus cmdk for
 * the filtering and keyboard list, so arrow keys, type-ahead, and the
 * escape-to-close behaviour are not ours to get wrong.
 *
 * Use it where the option count can outgrow a scroll — categories, later
 * assignees. A plain <Select> stays the right control for three fixed statuses:
 * a search box over three items is furniture.
 *
 * Multi-select ported from the somakwetu package alongside the single-select
 * case. Its remote-search, inline-checklist, and hidden-form-input variants are
 * still only in that source — none has a caller here.
 */
export function Combobox(props: ComboboxProps) {
  const {
    items,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    emptyMessage = 'No matches.',
    emptyAction,
    disabled,
    className,
    triggerClassName,
    contentClassName,
    'aria-label': ariaLabel,
    id,
  } = props

  const [open, setOpen] = React.useState(false)

  const selectedValues: ReadonlyArray<string> = props.multi
    ? props.value
    : props.value
      ? [props.value]
      : []

  const selectedItems = selectedValues.map(
    (value) =>
      items.find((it) => it.value === value) ??
      // A value with no matching item still has to show something — an id from
      // a category that was renamed or deleted should not silently read as
      // "nothing selected".
      ({ value, label: value } satisfies ComboboxItem),
  )

  function toggle(value: string) {
    if (props.multi) {
      const next = props.value.includes(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value]
      props.onChange(next)
      // The popover stays open: picking several things is the whole point, and
      // reopening it between each one turns three choices into six clicks.
      return
    }
    props.onChange(value === props.value ? null : value)
    setOpen(false)
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation()
    if (props.multi) props.onChange([])
    else props.onChange(null)
  }

  const triggerLabel = props.multi
    ? selectedValues.length === 0
      ? placeholder
      : `${selectedValues.length} selected`
    : (selectedItems[0]?.label ?? placeholder)

  const hasSelection = selectedValues.length > 0

  return (
    <div className={cn('w-full', className)}>
      {props.multi && selectedItems.length > 0 ? (
        // Chips above the trigger rather than inside it. The trigger is a
        // <button>, and a removable chip needs its own button — nesting one
        // inside the other is invalid HTML and a hydration error.
        <div className="mb-1.5 flex flex-wrap gap-1">
          {selectedItems.map((it) => (
            <span
              key={it.value}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
            >
              {it.label}
              <button
                type="button"
                // Names the specific chip. A row of identical "Remove" buttons
                // is useless read aloud.
                aria-label={`Remove ${it.label}`}
                disabled={disabled}
                onClick={() => toggle(it.value)}
                // A bare 12px icon was the smallest target in the system —
                // under even WCAG 2.2's 24px floor. The chip stays 12px.
                className="relative hit-44 rounded-sm hover:text-foreground"
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              // h-9 is 36px tall; `hit-44` adds the missing 8px as an invisible
              // ::after so the filter selects are thumb-sized without the
              // filter bar growing.
              'relative hit-44 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              triggerClassName,
            )}
          >
            <span className={cn('truncate', !hasSelection && 'text-muted-foreground')}>
              {triggerLabel}
            </span>
            <span className="flex items-center gap-1">
              {hasSelection && !disabled ? (
                // A <span role="button">, not a <button>: Radix renders this
                // whole trigger as a <button> via asChild, and a nested button
                // is invalid HTML. tabIndex={-1} keeps it out of the tab order —
                // keyboard users clear by toggling rows, or via the chips above.
                <span
                  role="button"
                  aria-label="Clear selection"
                  tabIndex={-1}
                  onClick={clearAll}
                  className="inline-flex cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </span>
              ) : null}
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </span>
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className={cn(
              'z-50 w-(--radix-popover-trigger-width) min-w-56 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
              contentClassName,
            )}
          >
            <Command>
              <CommandInput
                placeholder={searchPlaceholder}
                className="w-full border-b bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground"
              />
              <CommandList className="max-h-64 overflow-y-auto p-1">
                <CommandEmpty className="px-2 py-3 text-center type-meta text-muted-foreground">
                  <span>{emptyMessage}</span>
                  {emptyAction ? <div className="mt-2">{emptyAction}</div> : null}
                </CommandEmpty>
                <CommandGroup>
                  {items.map((it) => {
                    const isSelected = selectedValues.includes(it.value)
                    return (
                      <CommandItem
                        key={it.value}
                        value={it.value}
                        // cmdk matches on `value`, which is an id — without this
                        // the user would be searching UUIDs.
                        keywords={[it.label, it.description ?? ''].filter(Boolean)}
                        disabled={it.disabled}
                        onSelect={() => {
                          if (it.disabled) return
                          toggle(it.value)
                        }}
                        className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
                      >
                        <CheckIcon
                          className={cn(
                            'mt-0.5 size-3.5 shrink-0',
                            isSelected ? 'text-foreground' : 'text-transparent',
                          )}
                        />
                        <div className="min-w-0">
                          <div className="truncate">{it.label}</div>
                          {it.description ? (
                            <div className="truncate text-xs text-muted-foreground">
                              {it.description}
                            </div>
                          ) : null}
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
