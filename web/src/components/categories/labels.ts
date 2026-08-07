/**
 * The words this screen says about counts and about deleting.
 *
 * Pure and separate from the components purely so the delete copy can be
 * asserted — it is the sentence a user reads before a destructive, irreversible
 * action, and the empty-category case says something materially different from
 * the rest.
 */

/** "3 tasks" reads; a bare "3" next to a name does not say 3 of what. */
export function taskCountLabel(count: number): string {
  if (count === 0) return 'No tasks'
  return count === 1 ? '1 task' : `${count} tasks`
}

/**
 * Says what actually happens, because what actually happens is not obvious.
 *
 * Only the JOIN rows cascade: `task_categories` has `onDelete: 'cascade'` on
 * both sides, and `tasks` does not reference `categories` at all. So the tasks
 * genuinely survive and simply lose the label. A confirm that said "this cannot
 * be undone" and stopped would leave the user assuming the worst and keeping a
 * category they wanted gone.
 *
 * `undefined` is the counts request still being in flight — the dialog must
 * still be answerable, so it speaks about "any tasks" rather than blocking on a
 * number it may never get.
 */
export function deleteBlurb(name: string, count: number | undefined): string {
  if (count === 0) {
    return `“${name}” has no tasks in it, so nothing else changes. The category itself is removed for good.`
  }

  const subject = count === undefined ? 'Any tasks in it' : `${taskCountLabel(count)} in it`
  return `${subject} will not be deleted. They stay on your board and become uncategorised — only the category itself is removed, for good.`
}
