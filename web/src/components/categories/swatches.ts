/**
 * The entire colour vocabulary a category can have, and the only place in the
 * web package where a raw hex literal is allowed.
 *
 * Fixed set rather than `<input type="color">`, which plan.md §14 asks for and
 * which is also the correct call: a free picker lets someone choose #FFFFFE on
 * a white card, or two greens nobody can tell apart, and the dot stops doing
 * the one job it has — identifying a category at a glance. A closed set is also
 * the only version that can be checked against both themes once and stay true.
 *
 * Six digits, because that is exactly what the server accepts:
 * `^#[0-9a-fA-F]{6}$` in server/src/modules/categories/dtos/create-category.dto.ts.
 * Three-digit shorthand (#F00) is a 422 — do not "tidy" these.
 *
 * Mid-tone on purpose. These render as a small dot on `bg-card`, which is near
 * white in light and near black in dark, so anything very light or very dark
 * disappears in one of the two.
 */
export const SWATCHES = [
  { value: '#6366F1', label: 'Indigo' },
  { value: '#0EA5E9', label: 'Sky' },
  { value: '#14B8A6', label: 'Teal' },
  { value: '#22C55E', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#F97316', label: 'Orange' },
  { value: '#F43F5E', label: 'Rose' },
  { value: '#A855F7', label: 'Violet' },
] as const

/** What a new category gets before the user touches the picker. */
export const DEFAULT_SWATCH: string = SWATCHES[0].value

/**
 * `color` is nullable on the server and every category predating this screen
 * has none, so the dot needs a defined answer for null rather than rendering
 * `background: null` and collapsing to a transparent gap.
 */
export function swatchLabel(color: string | null): string {
  if (!color) return 'No colour'
  return SWATCHES.find((s) => s.value.toLowerCase() === color.toLowerCase())?.label ?? color
}
