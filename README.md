# Course Scheduler

A desktop course-scheduling app for departments: manage the course catalog, sections,
instructors and rooms, then auto-generate clash-free weekly timetables that respect
hard constraints and soft preferences.

Built with **Electron + React + TypeScript + SQLite** (better-sqlite3 + Drizzle) and
Tailwind CSS.

## Features

- **Catalog management** — terms, courses, sections, instructors (with unavailable
  times and weekly hour limits) and rooms (capacity, building, travel group)
- **Weekly timetable UI** — department / per-room / per-instructor views with live
  conflict highlighting (room & instructor double-booking, same-course overlap,
  capacity, unavailability, travel-time violations)
- **Auto-scheduling solver** — backtracking search with randomized restarts that
  assigns meeting times, rooms and free instructors. Returns the top-N ranked
  options by soft-preference score (preferred time window, back-to-back density,
  weekly hour limits). Locked sections are treated as fixed.
- **Multi-week scheduling** — a term has N weeks (real calendar dates, break
  weeks). Sections keep a weekly **pattern**; each week can have **overrides**:
  move an occurrence (day/time/room/instructor), cancel it, or add an extra
  session. Week view supports click-to-edit and drag-and-drop with snapping,
  and Generate can **re-solve a single week** (other sections' effective
  meetings become fixed inputs; results are written back as overrides).
- **Import / export** — full-term JSON export/import (including overrides),
  CSV import/export per entity, and Excel export scoped to the pattern, a
  selected week, or all weeks (one sheet per week)
- **Local-first** — data lives in a SQLite file under the OS user-data directory
- **Multi-language UI** — Turkish (default) and English; switch anytime from the
  sidebar or Settings. Adding a language = adding one dictionary file
  (see below)

## Languages

The UI ships with **Türkçe** (default) and **English**. The selector in
**Settings → Language** switches instantly and the choice is remembered in
`localStorage`.

To add a new language:

1. Copy `src/renderer/src/i18n/en.ts` to a new file (e.g. `de.ts`) and
   translate the values (keys must stay identical — TypeScript enforces it).
2. Register it in `src/renderer/src/i18n/index.ts`: add the locale to the
   `Locale` union, `dictionaries`, `localeNames`, `localeOrder`, and add
   `DAY_SHORT` / `DAY_LETTERS` arrays for it.

Conflicts and solver summaries are produced as structured data by the shared
engine and localized in the renderer, so every visible message follows the
selected language. Data-interchange formats (CSV headers, JSON keys, Excel
day names) intentionally stay in English for portability.

## Theming & UI components

The UI is built on [shadcn/ui](https://ui.shadcn.com) (Radix primitives +
Tailwind CSS v4) with a semantic design-token layer:

- All colors flow through CSS variables (`--background`, `--card`,
  `--primary`, `--muted-foreground`, …) declared in
  `src/renderer/src/index.css` (light in `:root`, dark in `.dark`) and mapped
  into Tailwind via `@theme inline`.
- Theme state lives in `src/renderer/src/theme.ts`: **System / Light / Dark**,
  default System (follows `prefers-color-scheme` live), persisted in
  `localStorage.theme`, applied by toggling `.dark` on `<html>`. Switch from
  **Settings → Language & Theme**.
- `src/renderer/src/components/ui.tsx` is a thin compatibility layer over the
  vendored shadcn components in `src/renderer/src/components/ui/` — pages
  keep a stable API (`Button variant="primary"`, `Modal`, `Select`, `Badge
  tone`, …).
- To add more shadcn components: `npx shadcn@latest add <component>` and
  re-export from the compatibility layer if needed.
- Timetable course-block colors are data-driven hues (hash of the course
  code) and intentionally theme-independent.



## Licensing & subscription

The app ships with a Lemon Squeezy–based subscription licensing system:
**14-day device-bound trial → license activation → read-only lockout** with a
30-day offline grace period. Viewing and exports always stay available; editing
and generation require a valid license (enforced in the main process, not just
the UI).

Configuration lives in `licensing.config.json` (project root in dev, copied to
resources on packaging):

```json
{
  "mode": "off",                  // off | test | live
  "apiBase": "https://api.lemonsqueezy.com",
  "storeUrl": "",                 // your checkout/store URL (Buy button)
  "productId": "",                // Lemon Squeezy product id (required for live)
  "trialDays": 14,
  "graceDays": 30,
  "validationIntervalDays": 7
}
```

- `off` — licensing disabled (development)
- `test` — mock provider, behavior set via `LICENSING_MOCK=valid|expired|invalid|unreachable`
- `live` — real Lemon Squeezy License API (`/v1/licenses/activate|validate|deactivate`)

To go live:

1. Create a Lemon Squeezy account, add a **subscription product** (monthly +
   yearly variants) and enable **license keys** with an activation limit
2. Fill `storeUrl` + `productId` in `licensing.config.json` and set `mode` to `live`
3. Package (`npm run package`) — the config is bundled as an app resource and
   the binary is hardened with Electron fuses (no `--inspect`, no
   `NODE_OPTIONS`, asar-only loading)

The license record is stored encrypted via Electron `safeStorage`
(OS keychain-backed) in `userData/license.bin`, bound to a machine
fingerprint. License state machine is unit-tested (`tests/licensing.test.ts`)
and the full activation/lockout flow is covered by `node scripts/e2e-licensing.cjs`.

## Getting started

```bash
npm install        # also rebuilds better-sqlite3 for Electron
npm run dev        # launch the app in dev mode
```

First launch shows an onboarding screen: create an empty term or load the sample
CS department to explore.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run the Electron app with hot reload |
| `npm run build` | Production build to `out/` |
| `npm run typecheck` | Typecheck main/preload + renderer |
| `npm test` | Unit tests (time utils, constraints, solver) |
| `npm run package` | Build a Windows NSIS installer |

## Constraint model

**Hard** (solver never violates): room double-booking, instructor double-booking,
sections of the same course overlapping, room capacity, instructor unavailable
times, and travel time between rooms in different travel groups.

**Soft** (penalized in the score): meetings outside the preferred time window,
back-to-back meetings (gap under the configured threshold), and instructors
exceeding their weekly teaching-hour limit.

Configure the day window, preferred window, travel matrix, penalties and solver
budgets in **Settings**.
