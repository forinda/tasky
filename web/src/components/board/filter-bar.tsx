import { XIcon } from 'lucide-react'
import { PRIORITY_LABELS } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import type { BoardFilters } from '@/features/tasks/keys'

interface FilterBarProps {
  filters: BoardFilters
  categories: Array<{ id: string; name: string }>
  onChange: (key: 'priority' | 'category' | 'q', value: string | null) => void
  onClearAll: () => void
}

/**
 * One dismissible chip per active filter.
 *
 * This is plan.md §14's honest answer to "why am I seeing three tasks": the
 * allow-list made visible instead of mysterious. Every chip maps to one server
 * filter and they AND together — including two category chips, which is why the
 * server uses EXISTS rather than a join.
 */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-1 pl-2.5 type-meta text-foreground">
      {label}
      <Button
        variant="ghost"
        size="sm"
        className="size-5 rounded-full p-0"
        // Names the specific filter, not just "Remove" — a row of identical
        // "Remove" buttons is useless read aloud.
        aria-label={`Remove filter: ${label}`}
        onClick={onRemove}
      >
        <XIcon className="size-3" aria-hidden="true" />
      </Button>
    </span>
  )
}

export function FilterBar({ filters, categories, onChange, onClearAll }: FilterBarProps) {
  const categoryName = categories.find((c) => c.id === filters.categoryId)?.name
  const activeChips = [
    filters.priority
      ? {
          key: 'priority' as const,
          label: `Priority: ${PRIORITY_LABELS[filters.priority as keyof typeof PRIORITY_LABELS] ?? filters.priority}`,
        }
      : null,
    filters.categoryId
      ? { key: 'category' as const, label: `Category: ${categoryName ?? 'Unknown'}` }
      : null,
    filters.q ? { key: 'q' as const, label: `Search: ${filters.q}` } : null,
  ].filter(Boolean) as Array<{ key: 'priority' | 'category' | 'q'; label: string }>

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Label htmlFor="filter-priority" className="type-meta text-muted-foreground">
            Priority
          </Label>
          <div className="mt-1.5">
            <Combobox
              id="filter-priority"
              items={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
              value={filters.priority ?? null}
              onChange={(value) => onChange('priority', value)}
              placeholder="Any priority"
              searchPlaceholder="Search priorities"
            />
          </div>
        </div>

        <div className="w-56">
          <Label htmlFor="filter-category" className="type-meta text-muted-foreground">
            Category
          </Label>
          <div className="mt-1.5">
            {/* The searchable-select case the Combobox was ported for: a
                category list can outgrow a scroll, unlike three priorities. */}
            <Combobox
              id="filter-category"
              items={categories.map((c) => ({ value: c.id, label: c.name }))}
              value={filters.categoryId ?? null}
              onChange={(value) => onChange('category', value)}
              placeholder="Any category"
              searchPlaceholder="Search categories"
              emptyMessage="No categories yet."
            />
          </div>
        </div>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <Chip key={chip.key} label={chip.label} onRemove={() => onChange(chip.key, null)} />
          ))}
          {/* Only once there is more than one to clear — a "Clear all" beside a
              single chip is two controls for one action. */}
          {activeChips.length > 1 ? (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Clear all
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
