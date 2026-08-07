# Story 12 — Drag and Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move a task between columns by dragging it — and by keyboard, which is the harder half and the reason this is its own story.

**Depends on:** Story 11 (#10) and the multi-select PR stacked on it.

---

## Why this is separate, restated

`plan.md` §14: *"A kanban board with no drag still works; status changes through
the card menu. Shipping 11 first means the board is usable while drag-and-drop —
the piece most likely to eat time on touch targets, scroll containers, and
keyboard fallbacks — gets its own budget."*

That budget is now being spent. The board already works without drag: the status
`Combobox` in the detail sheet moves a task between columns, and it stays. Drag
is an accelerant, never the only path.

## The decision that shapes this story

**Keyboard is in scope, not deferred.** A board whose primary gesture is
mouse-only is exactly the accessibility debt this project has refused everywhere
else — the focus rings, the pill words, the labelled fields, the 320px rule. A
drag implementation without a keyboard path would be the first place we shipped
"most users can do this".

dnd-kit is chosen because its `KeyboardSensor` and `announcements` API are real
rather than an afterthought. `react-beautiful-dnd` is unmaintained; the HTML5
drag-and-drop API has no keyboard story at all and is famously inconsistent on
touch.

## What is already decided — do not relitigate

- **Status is the column.** Dragging card → column issues `PUT /tasks/:id` with
  the new status. There is no ordering column in the schema, so **within-column
  reordering is not persistable** — see the scope note below.
- **The sheet stays.** Drag does not replace the status select.
- **Every mutation invalidates every column** (Story 11). Optimistic updates are
  added here, where they earn their place, not retrofitted everywhere.
- **Owner scoping, RFC 9457 errors, the type bridge** — all unchanged.

## Ordering within a column is out of scope, and that is a schema fact

`tasks` has no `position` column. Sorting is by `createdAt` (or whatever `?sort=`
says). Cards can therefore be dragged **between** columns but not **reordered
within** one, because there would be nowhere to put the result: the next refetch
would snap them back to server order, which is worse than not offering it.

Adding ordering means a migration, a rebalancing strategy for fractional
indices, and a decision about whether order is per-user or global. That is a
story, not a step. **Do not fake it with local-only state.**

## Global Constraints

- pnpm only. Commands from `/home/forinda/Desktop/adero-api`; **`pwd` first**.
- Never `pkill -f <name>`. Kill by port, checking `/proc/<pid>/cwd`.
- Never commit on a red typecheck.
- **Check the instrument before trusting a clean result.** Seven "findings" in
  this project have turned out to be the measurement. Drag testing is especially
  prone to this: synthetic pointer events do not reproduce a real drag, and
  `:focus-visible` behaves differently after a synthetic click.

---

### Task 1: dnd-kit, and dragging between columns

**Files:** modify `web/src/routes/board.tsx`,
`web/src/components/board/{column,task-card}.tsx`.

- [ ] **Step 1: Install** `@dnd-kit/core`. Not `@dnd-kit/sortable` — that is for
  ordering within a list, which this story explicitly does not do.

- [ ] **Step 2: `DndContext`** around the board, with `PointerSensor` configured
  with an activation distance. Without one, every click on a card starts a
  micro-drag and the card never opens its sheet — the classic
  "drag broke my click" bug.

- [ ] **Step 3: Columns are drop targets** (`useDroppable`), cards are draggables
  (`useDraggable`). The drop target is the **whole column including its empty
  state** — a column you cannot drop into when empty is a column you can never
  refill.

- [ ] **Step 4: `DragOverlay`** for the dragged card, so the original stays in
  place until the drop resolves.

- [ ] **Step 5: On drop**, `PUT /tasks/:id` with the new status. A drop onto the
  card's current column is a no-op — do not issue a request that changes nothing.

### Task 2: Optimistic updates

**Files:** modify `web/src/features/tasks/mutations.ts`.

- [ ] **Step 1: Move the card immediately**, then reconcile. Without this the
  card sits in its old column until the request returns and then jumps — which
  reads as a failed drop even when the write succeeded.

- [ ] **Step 2: Roll back on error**, and say so. A silent revert is
  indistinguishable from a drop that never registered.

- [ ] **Step 3: `onSettled` invalidates**, so the server remains the authority.
  The optimistic value is a guess about what the server will say, never a
  replacement for asking.

- [ ] **Step 4: Cancel in-flight queries first** (`cancelQueries`), or a refetch
  that started before the mutation can land after it and overwrite the
  optimistic state with stale data.

### Task 3: Keyboard

**Files:** modify `web/src/components/board/task-card.tsx`, board route.

- [ ] **Step 1: `KeyboardSensor`** with dnd-kit's coordinate getter. Space picks
  up, arrows move between columns, Space drops, Escape cancels.

- [ ] **Step 2: The card is already a `<button>`** (Story 11), so it is reachable
  and it opens the sheet on Enter. Picking up with Space must not also open the
  sheet — one key, one action.

- [ ] **Step 3: Instructions are discoverable.** A keyboard affordance nobody is
  told about does not exist. dnd-kit's `screenReaderInstructions`, plus a visible
  hint where it does not clutter.

- [ ] **Step 4: Announcements** via dnd-kit's `announcements` — picked up, moved
  over a column, dropped, cancelled. Each names the task and the column, because
  "moved to position 2" tells a screen-reader user nothing about which board
  column they are in.

### Task 4: Touch and motion

- [ ] **Step 1: `TouchSensor`** with a delay, so a scroll gesture on the mobile
  column strip is not read as a drag. Story 11 made the columns scroll inside
  their own container; a zero-delay touch sensor would fight it.

- [ ] **Step 2: Touch targets** stay at least 44px in the drag affordance.

- [ ] **Step 3: `prefers-reduced-motion`** — no drop animation when reduced. The
  `rise` utility's lesson applies: declare the animation inside the
  no-preference query rather than shortening it, and **check the built CSS**,
  because Tailwind flattened that guard out of an `@utility` body once already.

### Task 5: Proof and PR

- [ ] Drag with a real mouse (Playwright's `dragTo`, not synthetic events) moves
  a card and persists across a reload.
- [ ] **Keyboard: Tab to a card, Space, ArrowRight, Space** — the task is in the
  next column after a reload. This is the acceptance test for the story.
- [ ] Escape mid-drag leaves the task where it started.
- [ ] A dropped card does not visibly jump back before settling.
- [ ] Announcements fire — assert the live region's text content changes.
- [ ] Contrast, focus, 320px, both themes.
- [ ] `pnpm run test`, `pnpm typecheck`, `pnpm build`. Commit, push, PR.

---

## Verification summary

| Check | Passes when | Mutation that must break it |
|---|---|---|
| Drag persists | Card is in the new column after reload | Drop the `PUT` → reverts on refetch |
| Keyboard move | Space/Arrow/Space moves it | Remove `KeyboardSensor` → nothing happens |
| Optimistic | No visible jump back | Remove `onMutate` → card sits then jumps |
| Rollback | Failed write returns the card and says so | Remove `onError` → card stays somewhere it is not |
| Cancel | Escape leaves it in place | — |
| Announcements | Live region text changes on pick up and drop | Remove `announcements` → silent |
| Click still works | A card click opens the sheet | Remove the activation distance → clicks become drags |
