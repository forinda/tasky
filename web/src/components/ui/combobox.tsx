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

export interface ComboboxProps {
  readonly items: ReadonlyArray<ComboboxItem>
  readonly value: string | null
  readonly onChange: (value: string | null) => void
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

/**
 * A select you can type into. Radix Popover for focus management plus cmdk for
 * the filtering and keyboard list, so arrow keys, type-ahead, and the
 * escape-to-close behaviour are not ours to get wrong.
 *
 * Use it where the option count can outgrow a scroll — categories, later
 * assignees. A plain <Select> stays the right control for three fixed statuses:
 * a search box over three items is furniture.
 */
export function Combobox({
  items,
  value,
  onChange,
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
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selected = items.find((it) => it.value === value)
  // A value with no matching item still has to show something — a stale id from
  // a category that was renamed away should not silently read as "nothing
  // selected".
  const label = selected?.label ?? value ?? placeholder

  return (
    <div className={cn('w-full', className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              triggerClassName,
            )}
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>{label}</span>
            <span className="flex items-center gap-1">
              {value && !disabled ? (
                // A <span role="button">, not a <button>: Radix renders this
                // whole trigger as a <button> via asChild, and a nested button
                // is invalid HTML. tabIndex={-1} keeps it out of the tab order —
                // keyboard users clear by selecting the row again.
                <span
                  role="button"
                  aria-label="Clear selection"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(null)
                  }}
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
                className="w-full border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <CommandList className="max-h-64 overflow-y-auto p-1">
                <CommandEmpty className="px-2 py-3 text-center type-meta text-muted-foreground">
                  <span>{emptyMessage}</span>
                  {emptyAction ? <div className="mt-2">{emptyAction}</div> : null}
                </CommandEmpty>
                <CommandGroup>
                  {items.map((it) => (
                    <CommandItem
                      key={it.value}
                      value={it.value}
                      // cmdk matches on `value`, which is an id — without this
                      // the user would be searching UUIDs.
                      keywords={[it.label, it.description ?? ''].filter(Boolean)}
                      disabled={it.disabled}
                      onSelect={() => {
                        if (it.disabled) return
                        onChange(it.value === value ? null : it.value)
                        setOpen(false)
                      }}
                      className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
                    >
                      <CheckIcon
                        className={cn(
                          'mt-0.5 size-3.5 shrink-0',
                          it.value === value ? 'text-foreground' : 'text-transparent',
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
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
