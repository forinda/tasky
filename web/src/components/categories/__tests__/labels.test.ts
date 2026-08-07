import { describe, it, expect } from 'vitest'
import { deleteBlurb, taskCountLabel } from '../labels'

describe('taskCountLabel', () => {
  it('singularises exactly one', () => {
    expect(taskCountLabel(1)).toBe('1 task')
  })

  it('pluralises everything else', () => {
    expect(taskCountLabel(0)).toBe('No tasks')
    expect(taskCountLabel(2)).toBe('2 tasks')
  })
})

describe('deleteBlurb', () => {
  // The load-bearing claim. The server cascades only the join rows, so this
  // sentence is a promise the schema keeps — if it ever stops saying the tasks
  // survive, the dialog is lying about a destructive action.
  it('promises the tasks survive and lose only the category', () => {
    const blurb = deleteBlurb('Work', 3)
    expect(blurb).toContain('3 tasks in it will not be deleted')
    expect(blurb).toContain('uncategorised')
  })

  it('does not claim surviving tasks when the category is empty', () => {
    const blurb = deleteBlurb('Work', 0)
    expect(blurb).toContain('no tasks in it')
    expect(blurb).not.toContain('will not be deleted')
  })

  // Counts arrive from a second request; the dialog has to be answerable before
  // it lands rather than promising a number it does not have.
  it('stays truthful while the count is still loading', () => {
    const blurb = deleteBlurb('Work', undefined)
    expect(blurb).toContain('Any tasks in it will not be deleted')
    expect(blurb).not.toContain('undefined')
  })
})
