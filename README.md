# Planit

Personal life dashboard — events, tasks and open loops in one place. Runs
entirely on Cloudflare: a Worker for the API, D1 for storage, and static
assets served from the edge.

**Live:** https://planit.gokulkumbakkara.workers.dev

---

## Features

- **Two views** — **Today** (progress bar, Events/Tasks panels, "Look out"
  open loops, right-rail month calendar and a "Coming up" list) and
  **Backlog** (every item grouped by date, with type/status/date-range filters
  and search across titles and notes)
- **Three item kinds** — Events (fixed, not checkable), Tasks (checkable,
  count toward daily progress, High/Med/Low priority), and Look-outs (open
  loops that stay visible until ticked off, dated or not)
- **Overdue tasks carry forward** automatically onto Today instead of
  vanishing, sorted oldest first, with an ageing color indicator
- **Date ranges** on any dated item — either "any day in this range" or
  "every day in this range"
- **No push notifications, by design** — Web Push can't reliably reach a
  device without an active connection (and on iOS/iPadOS only once installed
  to the Home Screen), so the app is built to be checked, not pinged
- **Touch-aware responsive layout** — sidebar becomes a bottom tab bar on
  iPhone / narrow Split View, 44px touch targets via `(hover: none)` /
  `(pointer: coarse)` detection, custom time-entry control instead of the
  native `<input type="time">`

---

## Tech Stack

- **Frontend**: single-file vanilla JavaScript (`public/index.html`), no build step
- **Backend**: Cloudflare Worker (`worker/index.js`), no framework — raw Fetch API routing
- **Database**: Cloudflare D1 (`worker/schema.sql`)
- **Deployment**: Wrangler, `[assets]` static-asset binding (no legacy Workers Sites dependency)

---

## Getting Started

### Prerequisites

- Node.js and npm
- A free [Cloudflare](https://cloudflare.com) account (Workers + D1)

### Installation

```bash
npm install
npx wrangler login
npx wrangler d1 create planit-db          # paste database_id into wrangler.toml
npm run db:init                           # apply schema to remote D1
npm run deploy
```

Then open the URL and add an item.

---

## Project Structure

```
public/index.html   single-file frontend (vanilla JS, no build step)
public/icon.png     tab / home-screen icon
worker/index.js     API routes + static-asset passthrough
worker/schema.sql   D1 schema
```

All resources — the Worker, the D1 database, the project folder — are named
`planit` / `planit-db`.

---

## API Reference

| Method | Route | Notes |
|---|---|---|
| GET | `/api/config` | `{ today, timeZone }` |
| GET | `/api/items` | filters: `?type=` `?done=0\|1` `?date=YYYY-MM-DD` |
| POST | `/api/items` | `{ type, title, date?, time?, note?, priority?, end_date?, daily? }` |
| PUT | `/api/items/:id` | any of `type, title, date, end_date, daily, time, note, priority, done, deleted` |
| DELETE | `/api/items/:id` | soft delete (`deleted = 1`) |

All responses are JSON with `Access-Control-Allow-Origin: *`; `OPTIONS` is
handled for preflight. Failures return `{ error }` with a 4xx/5xx status.

---

## Item Kinds

| Kind | Date | Notes |
|---|---|---|
| Event | required | a fixed point in the day — can't be checked off, doesn't count toward the day's progress |
| Task | **optional** | checkable, counts toward the day's progress. Always carries a High/Med/Low priority — **Low by default** if you don't pick one, never blank. With no date it stays in the backlog under **No date** — jot it down now, schedule it later. |
| **Look out** | **optional** | an open loop — "waiting on a delivery". Shows on the dashboard until you tick it off, whether or not it has a due date. Also carries a High/Med/Low priority, same as Task and same **Low by default** rule — priority is *importance*, which is independent of whether (or when) a thing is dated, so it applies to both kinds. Undated look-outs sort by priority since there's no date to sort by; dated ones sort by date first, priority breaking ties on the same day. |

**Overdue tasks carry forward.** A task left unchecked once its date passes
doesn't vanish — it moves onto Today automatically, sorted oldest first, with
a small dot next to it that starts sage green and deepens toward red (and then
darker still) the longer it's been waiting. Hover it for "Carried forward N
days". It stays there — and keeps counting toward the day's completion — until
you either finish it or delete it; Events aren't included, since they're
tied to a specific day rather than open-ended work.

Any dated item can carry a **date range** — hit **+ range** and give it a last
day. A range means one of two things, and you pick which:

- **One day, not fixed yet** — "sometime this week, the day isn't settled".
  Reads *"any day 14 – 18 Sept"*.
- **Every day** — a programme that runs across the range. Reads *"every day
  16 – 22 Sept · day 3 of 7"*.

Both stay on the dashboard for the whole range.

---

## Architecture Decisions

The original brief called for Web Push (VAPID + `crypto.subtle`, a service
worker, a cron digest). That was built, worked, and was then removed at the
user's request once real-world use showed Web Push's fundamental limits (no
delivery without a live connection; iOS requiring a Home Screen install) made
it less reliable than just checking the app — see the carry-forward behaviour
above for how the app now handles "I meant to do this and forgot" instead.

Also: the original spec's `[site] bucket` (legacy Workers Sites) needs the
`@cloudflare/kv-asset-handler` package and a `__STATIC_CONTENT` KV namespace,
which contradicts "wrangler as the only dependency". `[assets]` in
`wrangler.toml` is the current, dependency-free equivalent.

---

## Interface Details

**Logo:** a checkmark on a rounded square, sage on the app's warm charcoal —
`public/icon.png` (512px), `icon-maskable.png` (Android safe-zone padding),
`icon.svg` (monochrome Safari pinned-tab mark). The same mark is inlined in
the sidebar wordmark.

Two views behind a shared top bar (title, search, add, avatar).

**Today** — a progress bar (share of today's tasks completed,
including anything carried forward), then Events / Tasks panels,
a "Look out" section for open loops, and a right-rail month calendar plus a
"Coming up" list for the next three days. Calendar days carrying items are
dotted; clicking one jumps to the backlog filtered to that date.

**Backlog** — the add form, then every item grouped by date. Filters cover
type (multi-select), status, and date range: **Next 3 days** (rolling, today →
today+3), **This week** (calendar week containing today, Mon–Sun) and **This
month** (calendar month). Range filters are single-select; clicking the active
one clears it. Search matches titles and notes and applies to both views.

Completed tasks stay visible, dimmed, with the entire row — title, time and
note — struck through. Any item can be edited in place: double-click a row on
a laptop, or double-tap it on iPhone/iPad, to load it into the form.

**On iPad** (tested against the 9th gen, 810×1080) the sidebar stays in both
orientations with the content in a single comfortable column; the filter row
scrolls sideways rather than wrapping. **On iPhone**, and in an iPad Split View
narrower than ~700px, the sidebar becomes a bottom tab bar instead.

Touch affordances key off `(hover: none) and (pointer: coarse)`, not width, so
a finger always gets 44px targets and controls that aren't hidden behind
hover — while an iPad with a trackpad keeps hover. Inputs are 16px so Safari
never zooms on focus, and heights use `dvh` so nothing hides under Safari's
toolbar.

The time field is a custom control rather than `<input type="time">`, whose
native popup is an unstyleable system widget. It accepts `9`, `930`, `9:30`,
`9:30pm` or `21:30`.
