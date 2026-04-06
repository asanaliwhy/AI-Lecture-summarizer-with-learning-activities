# Presentation Layout Expansion Plan

## Goal

Add screenshot-inspired presentation layouts without breaking current decks, with the first priority being a new takeaway/summary presentation that matches the icon-based grid style from screenshot 4.

## Current State

- Backend currently generates semantic slide types: `title`, `section`, `content`, `two_column`, `stats`, `prose`, `summary`.
- Frontend renderer already supports multiple visual patterns inside `content`, but `summary` is still a text-card grid.
- `SlideTakeaway` only contains `title` and `description`; there is no icon field or layout/variant field.
- Prompt rules in `backend/internal/services/gemini.go` are still centered on the existing types and do not describe screenshot-like layouts.

## Implementation Strategy

Use an additive, backward-compatible approach:

1. Keep existing slide `type` semantics for compatibility.
2. Add a lightweight visual variant field so the backend can request a specific look without exploding the number of core slide types.
3. Extend takeaway data to support icons.
4. Implement the screenshot-4 icon takeaway layout first.
5. Add follow-up variants for the other screenshot patterns after the summary/takeaway variant is stable.

## Proposed Data Model Changes

### Frontend + Backend slide schema

- Add optional `variant` field on slide objects.
  - Initial values:
    - `default`
    - `summary_icons`
    - `media_split`
    - `feature_trio`
    - `comparison_table`
    - `banner_two_column`
- Add optional `icon` field to takeaway items.

### Files to update

- `backend/internal/models/presentation.go`
  - Extend `PresentationTakeaway` with `Icon string \`json:"icon,omitempty"\``
  - Extend `PresentationSlide` with `Variant *string \`json:"variant,omitempty"\``
- `src/lib/presentationTypes.ts`
  - Add `variant?: string | null` to `Slide`
  - Add `icon?: string` to `SlideTakeaway`
  - Preserve existing normalization for old presentations that do not include the new fields

## Renderer Plan

### Priority 1: Icon takeaway summary (matches screenshot 4)

Target look:

- Large title and short intro line across the top
- 2x2 grid of takeaway items
- Each item contains:
  - outlined/accent icon above or beside the label
  - short bold heading
  - 1 concise supporting line
- More air and less card heaviness than the current summary blocks

### Renderer implementation

- File: `src/components/presentation/SlideRenderer.tsx`
- In `case 'summary'`:
  - detect `slide.variant === 'summary_icons'`
  - render a dedicated icon-grid summary layout instead of the current bordered text-card layout
  - reuse current summary as fallback when no variant is set
- Create a small icon resolver helper:
  - allow emoji if provided directly
  - map semantic strings like `globe`, `code`, `users`, `shield`, `leaf`, `chart`, `book`, `clock` to lightweight icon rendering
  - default to a generic icon if unknown
- Styling targets:
  - 2x2 equal grid for four takeaways
  - icon size visually prominent enough for export/PDF
  - title/description hierarchy similar to screenshot 4
  - support both light and dark themes using existing `theme.accent`, `theme.text`, `theme.subtext`, `theme.border`

### Follow-up adjustments requested after first implementation

User requested two visual corrections for the takeaway (`summary_icons`) slide:

1. Make the takeaway section sit lower on the slide.
2. Wrap each takeaway item in a visible body/card container.

Implementation details for this pass:

- File: `src/components/presentation/SlideRenderer.tsx`
- In `case 'summary'` when `slide.variant === 'summary_icons'`:
  - Lower the takeaway block by increasing vertical separation under the title area.
  - Use an explicit content structure such as header block + spacer + grid (or larger `marginTop`) so the 2x2 grid starts lower.
  - Keep the title/subtitle area readable while shifting visual weight to the lower half.
  - Wrap each takeaway item in a card body (`panelCard`-like surface):
    - bordered/rounded container
    - internal padding
    - icon + heading + description inside the body
  - Ensure card height is consistent using `gridAutoRows: '1fr'` and `height: '100%'` on item bodies.
  - Keep icon tone and typography consistent with current theme tokens.

### Supporting normalization

- File: `src/lib/presentationTypes.ts`
  - when `slide.type === 'summary'` and `slide.takeaways` are derived from bullets, create default takeaway objects with empty `icon`
  - preserve variant if backend provides it

## Prompt / Generation Plan

### Summary/takeaway prompting

- File: `backend/internal/services/gemini.go`
- Update allowed output schema to mention optional `variant` and optional takeaway `icon`
- Add a new summary rule:
  - for presentations with four high-level takeaways, prefer `type="summary"` with `variant="summary_icons"`
  - each takeaway should include:
    - `title`: 2-4 words
    - `description`: 6-12 words
    - `icon`: simple semantic token or emoji
- Keep current plain summary fallback so the renderer still works with older/generated decks

### Normalization / fallback behavior

- If the model omits icons for a `summary_icons` slide:
  - infer icons from keywords in the takeaway title/description
  - example mappings:
    - global/international -> `globe`
    - platform/open-source/system -> `cpu` or `grid`
    - workforce/career/skills -> `chart`
    - access/equity/inclusion -> `shield` or `users`
- If the model omits `variant`, continue rendering current summary style

## Screenshot-Inspired Layouts After Summary Icons

These should be implemented after the icon takeaway summary is working:

1. `media_split`
   - Based on screenshot 1
   - Left image + right explanatory text block + short bullet list
   - Best for target audience/value proposition slides

2. `feature_trio`
   - Based on screenshot 2
   - Three equally weighted feature cards with illustration/icon, title, and short description
   - Can be a `content` variant rather than a new semantic slide type

3. `comparison_table`
   - Based on screenshot 3 / screenshot 6
   - Structured rows/columns for competitor comparison
   - Likely needs a new optional `table` payload on slide objects if pursued

4. `banner_two_column`
   - Based on screenshot 5
   - Decorative top banner with two short columns below
   - Could remain under `two_column` with variant styling

## Recommended Scope for First Implementation

Implement only this in the first pass:

1. `summary_icons` variant
2. takeaway `icon` support in schema
3. prompt guidance + backend icon inference

This delivers the exact user request about the takeaway section while minimizing risk to the already-stable slide types.

## Validation Plan

### Manual cases

- Existing old presentations still render unchanged.
- A `summary` slide without variant still uses current summary layout.
- A `summary` slide with `variant="summary_icons"` renders as icon grid.
- `summary_icons` layout appears lower on the slide (not crowded near top).
- Every takeaway in `summary_icons` is wrapped in a visible card body/container.
- PDF export preserves icon placement and spacing.
- PPTX export preserves icon hierarchy and does not clip content.
- Theme switching keeps icon contrast readable.

### Automated checks

- Frontend:
  - `npx tsc --noEmit`
  - `npm run build`
- Backend:
  - `go build ./...`
  - `go test ./internal/services ./internal/handlers ./internal/router`

## Risks / Notes

- A full prompt rewrite to many brand-new slide types would be higher risk and may destabilize current generation quality.
- Adding `variant` is lower risk than replacing the semantic type system outright.
- If comparison-table slides are required later, they likely need a dedicated structured payload beyond `bullets`/`columns`.

## Execution Order

1. Add `variant` + takeaway `icon` fields in backend/frontend types.
2. Extend normalization to preserve/fill new fields safely.
3. Implement `summary_icons` renderer in `SlideRenderer.tsx`.
4. Update prompt and backend post-processing for icon takeaway generation.
5. Verify viewer, thumbnails, PDF export, and PPTX export.
6. Iterate on the other screenshot-inspired variants only after summary icons are approved.

## Active Regression Fix Plan (Current)

### User-reported regressions to fix now

1. Stats cards still repeat unnatural fallback endings (e.g., repeated "benchmark...risk tradeoffs..." tails).
2. 2x2 stats visual rhythm regressed (frequent 3-card row instead of expected 2-column block rhythm).
3. Comparison table still hallucinates a narrative last row in some decks.

### Root causes confirmed

- Stats fallback still has a shared fallback template path, so different cards can converge to nearly identical text.
- Stats layout depends on card count; when only 3 metrics survive normalization, layout shifts away from the expected 2x2 rhythm.
- Table coverage logic still pushes toward an extra row in some cases; narrative candidates can pass filtering and become row 5.

### Implementation plan

#### A) Stats text quality hardening

- In `backend/internal/services/gemini.go`:
  - Remove remaining generic fallback tails for stats descriptions.
  - Use a compact, label-aware fallback bank with stronger variation by metric semantics (time/date/percentage/scale/resource labels).
  - Add dedupe guard per stats slide so normalized descriptions that are too similar are rewritten via alternate fallback templates.
  - Keep strict sentence cleanup: no transcript noise, no conversational fragments, always complete sentence ending with `.`.

#### B) Restore stable 2-column stats rhythm without fake metrics

- In `src/components/presentation/SlideRenderer.tsx`:
  - Make `statsGridColumns(3)` return 2 columns to preserve the 2-column visual rhythm when only 3 real metrics exist.
  - Keep 4 metrics as true 2x2, 5-6 metrics as 3-column grid.
- In backend: do **not** invent a fake 4th metric by default; preserve factuality-first behavior.

#### C) Stop comparison-table hallucinated trailing rows

- In `backend/internal/services/gemini.go` (`enrichComparisonTableSlide`):
  - Change row target policy to avoid forcing row 5 when 4 valid rows already exist.
  - Only synthesize additional rows when count is below minimum (min=4), not to always reach 5.
  - Tighten candidate rejection for narrative/meta row leakage:
    - reject rows overlapping subtitle/title semantics,
    - reject explanatory sentence-like rows (e.g., "each method plays...") using verb/phrase heuristics,
    - reject high-verbosity single-sentence rows split across columns.

### Validation

- Backend: `go test ./...`
- Frontend: `npx tsc --noEmit`, `npm run build`
- Manual generation checks:
  - stats slides no repeated boilerplate endings across cards,
  - 3-metric stats slide renders in 2-column rhythm,
  - 4-metric stats slide remains clean 2x2,
  - comparison table with 4 real rows does not gain hallucinated row 5.

### Commit strategy

1. `fix: diversify stats description fallback per metric`
2. `fix: restore two-column rhythm for three-metric stats slides`
3. `fix: stop forced fifth comparison row hallucination`
