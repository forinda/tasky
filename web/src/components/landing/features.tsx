import { Columns3, Tags, Flag } from 'lucide-react'

/**
 * Three features because there are three. Each sentence says what you do with
 * it, not what it is — "Drag a task to In progress" tells you more than "Kanban
 * board functionality".
 */
const FEATURES = [
  {
    icon: Columns3,
    title: 'Three columns',
    body: 'Move a task from To do to In progress to Done. That is the whole workflow — there is no fourth state to configure.',
  },
  {
    icon: Tags,
    title: 'Your categories',
    body: 'Group tasks the way you already think about them. Rename or delete a category and the tasks in it survive.',
  },
  {
    icon: Flag,
    title: 'Priorities you can read',
    body: 'Low, medium, high — each with its word, not just a colour. You can tell them apart at a glance and so can everyone else.',
  },
] as const

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <h2 className="type-title max-w-lg">Enough structure to be useful. No more.</h2>

        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-medium text-foreground">{title}</h3>
              <p className="mt-2 type-body text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
