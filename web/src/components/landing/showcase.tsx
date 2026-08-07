import { BoardVignette } from './board-vignette'

/**
 * The Coda move: the panel runs off the right edge so the page reads as a window
 * onto something larger. Below `md` it becomes a contained block — a bleeding
 * panel on a 320px screen is just a cut-off panel.
 */
export function Showcase() {
  return (
    <section id="board" className="scroll-mt-20 overflow-hidden border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-5 pt-20 sm:px-8 sm:pt-28">
        <div className="max-w-lg">
          <h2 className="type-title">One board. Everything on it.</h2>
          <p className="mt-3 type-body text-muted-foreground">
            Every task you own, in the column it belongs to, filtered down to the category you
            care about right now.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-10 pb-20 sm:px-8 sm:pb-28 md:pr-0">
        <BoardVignette board="busy" className="md:w-[130%] md:max-w-none" />
      </div>
    </section>
  )
}
