# Story 8 — Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The component vocabulary Stories 9–11 build from — primitives, the two app-specific components, and the system-wide decisions (type, focus, motion) that make them cohere.

**Tech Stack:** shadcn/ui (new-york), Tailwind v4, Radix primitives, fontsource self-hosted faces.

---

## A design decision this story changes

`plan.md` §12 says **"Inter throughout"**. That is the answer you give when you have not chosen. Inter is a fine UI face and it is also the single most-used typeface in software right now; a product whose only type decision is Inter looks like every other product.

Replacing it with a deliberate pairing:

| Role | Face | Where it appears |
|---|---|---|
| Display | **Bricolage Grotesque Variable** | Page titles, empty states, the landing hero. Nowhere else. |
| UI / body | **Geist Variable** | Everything else. The board is 14px Geist. |
| Mono | **Geist Mono** | Timestamps, counts, ids — anything that should align in a column |

**Why this pairing and not another.** The board is dense and functional, so the working face has to be excellent at 13–14px with real tabular figures — that is Geist's job, and it sits in the same register as Inter without being it. Bricolage has an actual width axis and editorial personality, which would be exhausting across a whole board and is exactly right for the handful of places the app *speaks* to you. Boldness spent in one place; everything around it quiet.

All three self-host via `@fontsource-variable/*` — no external requests, nothing to break under a strict CSP, no layout shift from a late webfont.

**The signature component is `EmptyState`.** Every board has empty columns — `plan.md` §14 insists they stay visible, because a column that vanishes when emptied is a broken board. Almost every product ships a dashed grey rectangle saying "No tasks". It is the one component that recurs constantly *and* is universally neglected, which makes it the right place for identity without fighting the pill and card decisions that came out of the Mobbin research.

It gets the display face, a specific instruction rather than a label, and the action inline. An empty screen is an invitation to act.

## What is already decided — do not relitigate

- **Palette** (`plan.md` §12, already in `web/src/index.css` as `@theme` tokens): violet accent `#6d4aff`, ink, muted, hairline, canvas, plus priority (slate/amber/red) and status (slate/sky/green). The accent sits in the violet family *deliberately* so the warm and green ranges stay free for meaning.
- **Priority and status are never encoded in colour alone.** Every pill ships its word. This is an accessibility floor — roughly one in twelve men has some colour vision deficiency — and it is also what keeps sky `in_progress` distinguishable from the violet accent at small sizes.
- **Card anatomy** (`plan.md` §14): title at full weight on its own line, then one dense row of small meta pills. Explicitly *not* the Slack Lists treatment of labelling every field.

## Global Constraints

- pnpm only. Commands from `/home/forinda/Desktop/adero-api`; **`pwd` first**.
- Never `pkill -f <name>` — it matches the whole machine. Kill by port, and check `/proc/<pid>/cwd` is inside this repo first.
- The server package must not change. This story is `web/` only.
- Use the `@/` alias. `web/tsconfig.json` maps it `["./src/*", "../server/src/*"]` in that order.
- `web/src/lib/` for library items, `web/src/components/ui/` for shadcn, `features/<name>/{keys,queries,mutations}.ts` for data.
- Never commit on a red typecheck.
- Tailwind v4 **tree-shakes unused `@theme` tokens** — a token is absent from the emitted CSS until a class uses it. Do not debug a "missing" token that is merely unused.

---

### Task 1: The system layer — type, focus, motion

Before any component, the decisions every component inherits.

**Files:** modify `web/src/index.css`; create `web/src/lib/fonts.ts` (or import in `main.tsx`).

- [ ] **Step 1: Install and self-host the faces**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./web add @fontsource-variable/bricolage-grotesque @fontsource-variable/geist @fontsource/geist-mono
```

Import them once, at the app entry, before `index.css`.

- [ ] **Step 2: Type scale in `@theme`**

Add to the existing `@theme` block:

```css
  --font-display: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
  --font-sans: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;
```

Set `font-sans` as the body default. The display face is opt-in via `font-display`, so it cannot leak into the board by accident.

Type scale — a small set with real intent, not a ramp of every size:

| Token | Size / tracking | Use |
|---|---|---|
| `text-display` | `clamp(2.5rem, 6vw, 4rem)`, tracking `-0.03em`, weight 700 | Landing hero only |
| `text-title` | `1.5rem`, tracking `-0.02em`, weight 600 | Page and dialog titles |
| `text-body` | `0.875rem` (14px) | The board, forms, everything |
| `text-meta` | `0.75rem` | Pills, timestamps, counts |

The tight tracking at display sizes is most of what separates a considered headline from a default one.

- [ ] **Step 3: The focus ring, defined once**

Focus is where accessibility and identity meet, and it is normally an afterthought. Define it in one place so every component inherits it:

```css
@layer base {
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 2px;
  }
}
```

`:focus-visible`, not `:focus` — a mouse user clicking a button should not see a ring, a keyboard user tabbing to it must. Do **not** set `outline: none` anywhere; if a component needs a different ring, override the colour, never remove it.

- [ ] **Step 4: The motion policy**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Durations: 150ms ease-out for hover and focus, 200ms for anything that moves position. Written down now so Story 12's drag-and-drop does not invent its own.

- [ ] **Step 5: Verify the faces actually load and the ring actually shows**

Build, then confirm the font files are emitted and referenced:

```bash
pnpm --filter ./web build
ls web/dist/assets/*.woff2 | head -3
grep -o "Bricolage[^;\"]*" web/dist/assets/*.css | head -1
```

Fonts must appear in `dist/assets`. If they do not, the import is missing and the browser will silently fall back to `system-ui` — which looks *fine*, which is why it goes unnoticed.

- [ ] **Step 6: Commit** — `feat: add type scale, focus ring, and motion policy`

---

### Task 2: shadcn primitives

**Files:** create `web/src/components/ui/*`; possibly modify `web/src/index.css`.

- [ ] **Step 1: Initialise shadcn**

`web/components.json` already exists from Story 7 (new-york, `baseColor: slate`, `cssVariables: true`, `tailwind.config: ""` for v4). Verify the CLI accepts it:

```bash
cd /home/forinda/Desktop/adero-api/web && pnpm dlx shadcn@latest add button
```

**If the CLI wants to rewrite `index.css` or add a `tailwind.config.js`, stop and read the diff before accepting.** v4 is CSS-first and our `@theme` block is hand-authored; a CLI that overwrites it would silently drop the palette reasoning.

- [ ] **Step 2: Reconcile shadcn's variables with our tokens**

shadcn generates its own semantic layer — `--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`. We already have `--color-accent`, `--color-ink`, `--color-canvas`, `--color-hairline`.

**Do not maintain two palettes.** Map shadcn's names onto ours so there is one source of truth:

```css
  --primary: var(--color-accent);
  --background: var(--color-canvas);
  --foreground: var(--color-ink);
  --border: var(--color-hairline);
  --ring: var(--color-accent);
```

Check the exact variable names the CLI emitted — they may differ by version. Report what you found.

- [ ] **Step 3: Add the primitives**

```bash
pnpm dlx shadcn@latest add button input label select dialog sheet sonner skeleton
```

That set and no more. Each one is needed by a named screen in Stories 9–11: Button and Input everywhere, Label for form accessibility, Select for priority and status, Dialog for confirms, Sheet for the task detail panel (`plan.md` §14 specifies a right-side sheet, not a route change), Sonner for toasts, Skeleton for loading.

Do not add Card, Table, Accordion, or the rest "while we're here" — an unused component is a maintenance surface with no user.

- [ ] **Step 4: Verify the focus ring survived**

shadcn components often ship `focus-visible:outline-none` with their own ring utilities. Check each added component for `outline-none` and make sure a visible ring remains — either theirs using our accent, or ours. **Tab through the gallery in Task 4 and confirm every control shows a ring.**

- [ ] **Step 5: Commit** — `feat: add shadcn primitives mapped to the project palette`

---

### Task 3: `Pill` and `EmptyState`

The two components shadcn cannot give us, because they encode this product's rules.

**Files:** create `web/src/components/pill.tsx`, `web/src/components/empty-state.tsx`.

- [ ] **Step 1: `Pill`**

Renders priority and status. The rule it enforces: **the word is always present**. Make that structural rather than a convention someone can forget — the component takes the value and renders both the colour and the label, so there is no way to call it that produces colour alone.

```tsx
type PillProps =
  | { kind: 'priority'; value: TaskPriority }
  | { kind: 'status'; value: TaskStatus }
```

A discriminated union, so `<Pill kind="priority" value="done" />` will not compile. Import the union types from the server via `@/` — the same generated types the API uses, so adding a status server-side surfaces here as a compile error.

Labels: `todo` renders as "To do", `in_progress` as "In progress". The wire format is not the display format, and the mapping lives in the component rather than at every call site.

Sizing: `text-meta`, tight padding. This is the most-repeated atom in the product — it appears on every card — so it must read at a glance and not dominate.

- [ ] **Step 2: `EmptyState` — the signature**

Takes a title, a line of guidance, and an action. Three rules, from the design brief:

- **Display face for the title.** This is one of the few places the app speaks.
- **The guidance is an instruction, not a label.** "No tasks" describes; "Add your first task to this column" directs. An empty screen is an invitation to act.
- **The action is part of the component**, not something every caller remembers to add.

Variants for the two real contexts: an empty board column (compact, sits inside a column) and an empty page (centred, more room). Do not build a third for a case that does not exist yet.

- [ ] **Step 3: Copy**

Write the strings as design material. Active voice, sentence case, no apologies. A button that says "Add task" produces a toast that says "Task added" — the vocabulary stays constant through the flow, because that consistency is how someone learns their way around.

- [ ] **Step 4: Commit** — `feat: add Pill and EmptyState`

---

### Task 4: The gallery, and proving the a11y floor

A route rendering every component in every state. Its job is to make Stories 9–11 cheap — a screen author can see what exists instead of inventing a fourth button variant — and to make accessibility checkable in one place rather than eleven.

**Files:** create `web/src/routes/gallery.tsx`; modify `web/src/router.tsx`.

- [ ] **Step 1: Build it**

Mount at `/gallery`. Every component, every variant, every state including disabled and loading. Both `Pill` kinds with all values. Both `EmptyState` variants. Real copy, not lorem — placeholder text hides copy problems until they ship.

- [ ] **Step 2: Keep it out of production**

```tsx
...(import.meta.env.DEV ? [{ path: '/gallery', element: <Gallery /> }] : [])
```

Vite statically replaces `import.meta.env.DEV`, so the gallery and its imports are dropped from the production bundle entirely. Verify: build, then grep `dist/assets/*.js` for a string that appears only in the gallery. **If it is present, the tree-shake did not happen** — report it rather than shipping dead code to every user.

- [ ] **Step 3: Prove the accessibility floor**

Not "it looks fine" — check each:

- **Tab through every control.** Every one shows a visible focus ring. Any that does not has an `outline-none` that needs undoing.
- **Dialog and Sheet trap focus** and close on Escape, returning focus to whatever opened them. Radix handles this; verify rather than assume.
- **Every input has a real `<label>`**, not a placeholder standing in for one. A placeholder disappears when you type, which is when you most need to know what the field is.
- **Pills read without colour.** Screenshot in greyscale, or just confirm the word is present in the DOM for every variant.
- **The page does not scroll horizontally at 320px.**

Report each with what you actually did. **Do not claim a UI behaviour you only proved compiles** — if you cannot drive a browser, say so and say what you checked instead.

- [ ] **Step 4: Commit** — `feat: add component gallery with accessibility verification`

---

## Done when

- [ ] `pnpm run typecheck` clean; `pnpm run test` still 142 server tests.
- [ ] The three faces are self-hosted and present in `dist/assets` as woff2.
- [ ] Every interactive control shows a visible focus ring on keyboard focus.
- [ ] `Pill` cannot be called in a way that renders colour without its word — enforced by types, not convention.
- [ ] `EmptyState` uses the display face and an instruction, and carries its action.
- [ ] The gallery is absent from the production bundle — verified by grep, not assumed.
- [ ] Dialog and Sheet trap focus and restore it on close.
- [ ] No horizontal scroll at 320px.

## Deliberately not in this story

- No landing page, auth screens, or board — Stories 9–11.
- No dark mode. `plan.md` does not specify one, and retrofitting a second palette to prove a point is scope creep. The tokens are variables, so it stays possible.
- No Card, Table, Accordion, Tooltip, or any component without a named consumer.
- No animation beyond the hover/focus policy. Story 12 owns drag-and-drop motion.
- No Storybook. The gallery route is the same thing at a fraction of the setup.

## Carried forward

- The token is in `localStorage`, XSS-readable — a whole-auth-design change, not a local fix.
- Rate limiting is per-process in-memory.
- `DATABASE_URL` and `clientDir` are both `cwd`-relative — a Dockerfile footgun.
