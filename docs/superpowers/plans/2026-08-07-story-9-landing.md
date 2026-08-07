# Story 9 — Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public page at `/`. One page, one primary CTA, built from the Story 8 vocabulary — no new colours, no new type scale, no fourth button variant.

**Tech Stack:** React 19, React Router 8, Tailwind v4, the Story 8 components.

**Depends on:** Story 8 (merged). Touches no API, so it does not wait on 10–12.

---

## Four things in `plan.md` §13 that cannot ship as written

§13 was written before there was a product. Four of its items would put something
untrue on the page, and one of them describes an asset that does not exist yet.
Each gets an honest replacement rather than a placeholder that "will be filled in
later" — a landing page is the one artefact people screenshot.

| §13 says | Problem | What ships instead |
|---|---|---|
| "Social proof line above the headline" | There are no users. A count, a rating, or "trusted by N teams" would be fabricated, and it is the kind of claim that is trivially checkable and permanently embarrassing. | A factual eyebrow about the product, not its adoption. Same position, same cheap credibility, nothing invented. |
| "Logo strip — placeholder marks" | A "Trusted by teams at ⬜ ⬜ ⬜" strip reads as either fake logos or an unfinished page. Both are worse than the space it occupies. | Cut. Revisit when there is a real logo to put there. |
| "Product screenshot of the board" | The board is Story 11. A mocked-up image would also go stale the moment the board changes. | A **live vignette** built from the real `Pill`, card, and `EmptyState` components. It is the actual UI, it cannot drift from it, and it doubles as a smoke test that the Story 8 components compose. |
| Nav: "Features, Pricing" | There is no pricing. A link to a page that does not exist, or to a `#pricing` section inventing tiers, is a lie in the navigation. | Nav is wordmark, Features (in-page anchor), Log in, Get started free. |

**What is kept exactly as written:** one primary CTA, repeated in nav and hero and
the closing band, never two competing ones. That was the single most consistent
pattern across all eight landing references and it is not up for revision.

## What is already decided — do not relitigate

- **Palette and type** are Story 8's and are already in `web/src/index.css`. The
  landing page introduces **no new colour**. If something needs a colour that is
  not there, that is a signal the design is wrong, not the palette.
- **Bricolage is for display only** — hero headline, section headings. Never body.
- **The violet→cyan gradient is hero-blob only, never on text.** Gradient text is
  the single most common tell of a templated landing page, and it fails contrast.
- **shadcn token vocabulary**: `text-muted-foreground`, `bg-card`, `border-border`.
  Never a raw hex, never a `--color-*` name that shadcn already owns — that
  collision has now caused two separate contrast bugs.
- **Motion**: 150ms hover, 200ms movement, everything under `prefers-reduced-motion`.

## Global Constraints

- pnpm only. Commands from `/home/forinda/Desktop/adero-api`; **`pwd` first**.
- Never `pkill -f <name>` — it matches the whole machine. Kill by port, and check
  `/proc/<pid>/cwd` is inside this repo first. The dev server on 5173 is usually
  already ours; reuse it rather than starting a second.
- The server package must not change. This story is `web/` only.
- Use the `@/` alias.
- Never commit on a red typecheck.
- This page ships in the **production** bundle — unlike the gallery. Watch what
  it drags in.

---

### Task 1: Page shell — nav, footer, and the route swap

**Files:** create `web/src/routes/landing.tsx`, `web/src/components/landing/nav.tsx`,
`web/src/components/landing/footer.tsx`; modify `web/src/router.tsx`,
`web/src/routes/placeholders.tsx`.

- [ ] **Step 1: Nav.** Wordmark left; Features, Log in, and the one primary CTA
  right. On mobile the links collapse to just the CTA — a hamburger for three
  links is furniture. The nav is not sticky on first load; it becomes sticky
  after the hero scrolls past, so the CTA is always one click away without the
  bar eating 64px of a 667px phone viewport at the top of the page.

- [ ] **Step 2: Footer.** Wordmark, three link columns, copyright. Every link
  must go somewhere real or not exist. Placeholder `href="#"` links are how a
  footer becomes a list of 404s.

- [ ] **Step 3: Swap the route.** `Landing` moves out of `placeholders.tsx` into
  `routes/landing.tsx`. Delete the placeholder export rather than leaving it
  orphaned.

- [ ] **Step 4: Verify.** `pnpm --filter ./web build`. Nav renders, footer
  renders, `/` no longer shows "Landing page arrives in Story 9."

### Task 2: Hero — the thesis of the page

The hero is the one place the product speaks. Everything else on the page is
support.

**Files:** create `web/src/components/landing/hero.tsx`,
`web/src/components/landing/board-vignette.tsx`.

- [ ] **Step 1: The copy.** Headline is short, active, and about what the user
  does — not about the software's qualities. "Every task, in its column" beats
  "The modern task management platform". Subhead is one sentence naming the
  actual mechanic (categories, priorities, three columns). No adjective stacking.

- [ ] **Step 2: Eyebrow.** One factual line above the headline, in the
  small/mono register. Something true about the product, never about adoption.

- [ ] **Step 3: The CTA.** One button: "Get started free" → `/signup`. The email
  field from §13 is optional, and only ships if it **actually carries the value
  into signup** (router state, prefilled into the signup form in Story 10). An
  email field that discards what is typed is a decoration that costs the user
  real effort. If it cannot carry through, ship the bare button.

- [ ] **Step 4: The gradient blob.** Violet→cyan, behind the vignette, blurred,
  `aria-hidden`. It must not sit under any text — check the contrast auditor
  afterwards, because a blob drifting under a paragraph is exactly how a page
  passes review and fails in the browser.

- [ ] **Step 5: The board vignette.** Three columns rendered with the real
  components: a couple of task cards with real `Pill`s, and one column showing
  the real `EmptyState`. Card anatomy per `plan.md` §14 — title at full weight on
  its own line, one dense row of meta pills under it. Not interactive; it is a
  picture made of components. Give the wrapper `aria-hidden` only if the text in
  it is decorative duplication — otherwise leave it readable.

- [ ] **Step 6: Load motion.** One orchestrated sequence — eyebrow, headline,
  subhead, CTA, vignette — not five independent fades. Short, and gone by the
  time someone starts reading. Under `prefers-reduced-motion` it does not run at
  all (opacity 1 from the start, no "instant" animation that still flashes).

- [ ] **Step 7: Verify.** Build. Check at 320px: no horizontal scroll, headline
  does not overflow, vignette scales or crops deliberately rather than squashing.

### Task 3: Features, showcase, and the closing band

**Files:** create `web/src/components/landing/features.tsx`,
`web/src/components/landing/showcase.tsx`, `web/src/components/landing/cta-band.tsx`.

- [ ] **Step 1: Features.** Three columns — board, categories, priorities. Icon,
  heading, one sentence. The sentence says what you do with it, not what it is.
  Icons from lucide, already a dependency; no new icon set.

- [ ] **Step 2: Showcase.** Full-width vignette, offset so it bleeds off the
  right edge. At mobile widths the bleed becomes a contained block — a bleeding
  panel on a 320px screen is just a cut-off panel.

- [ ] **Step 3: Closing CTA band.** Accent-tinted, the same single CTA, same
  words. Same action, same name, every time it appears — that is what makes the
  page navigable rather than a set of unrelated buttons.

- [ ] **Step 4: Section rhythm.** Vertical spacing is a scale, not per-section
  guesses. Pick the values once and reuse; inconsistent section padding is the
  most common way a hand-built page reads as unfinished.

- [ ] **Step 5: Verify.** Build. Read the whole page top to bottom at desktop and
  at 320px.

### Task 4: Proof

The same discipline as Story 8: every check is mutation-tested, so a pass means
something. A check that cannot fail proves nothing.

- [ ] **Step 1: Contrast.** Run the auditor over `/` in the browser — every text
  node against its composited background, WCAG AA with the large-text rule. It
  must self-check at 21:1 for black on white (the naive version reads `oklch()`
  strings as RGB and scores everything 1.0). Zero failures required. Pay
  particular attention to text over the gradient blob and over the accent band.

- [ ] **Step 2: Focus.** Every focusable on the page shows a ring; killing the
  `:focus-visible` rule must make the same check report them.

- [ ] **Step 3: Keyboard.** Tab the whole page. Order follows visual order. The
  CTA is reachable. No focus trap outside a modal, and nothing focusable hidden
  behind the blob.

- [ ] **Step 4: 320px.** No horizontal scroll on `document.documentElement`.

- [ ] **Step 5: Reduced motion.** Emulate `prefers-reduced-motion: reduce` and
  confirm the load sequence does not run — not that it runs faster.

- [ ] **Step 6: One CTA.** Assert it structurally: count the primary-variant
  buttons and links pointing at `/signup`; they must all carry the same label.
  Two differently-worded primary CTAs is the failure mode §13 exists to prevent,
  and it is the kind of thing that creeps back in during a copy edit.

- [ ] **Step 7: Bundle.** Record the production bundle delta. The landing page
  ships to every visitor, unlike the gallery. If it grew by more than the page's
  own weight, something got dragged in.

- [ ] **Step 8: Commit and PR.** `pnpm run test` (142 server tests must still
  pass), typecheck, build, then commit, push, PR #8.

---

## Verification summary

| Check | Passes when | Mutation that must break it |
|---|---|---|
| Contrast | 0 failures, auditor self-checks at 21:1 | Force muted text to the muted surface → failures reported |
| Focus ring | Every focusable shows one | Kill `:focus-visible` → all reported |
| 320px | `scrollWidth <= clientWidth` | Add a `w-[400px]` block → reported |
| Reduced motion | Load sequence does not run | Remove the media query → it runs |
| One CTA | All `/signup` primaries share a label | Reword one → reported |
