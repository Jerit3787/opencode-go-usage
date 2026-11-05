# OpenCode Go usage viewer — design

Date: 2026-11-02
Status: approved

## Intent

OpenCode Go subscribers should be able to see their subscription usage inside OpenCode Desktop, the way Claude and Codex show plan limits: a compact circular meter while working, a click-open card with the 5-hour, weekly, and monthly windows, and a fuller usage page.

The app already ships a Usage page, but it reads `/api/experimental/usage/limits`, which only returns data for a signed-in OpenCode Console workspace. For a user who connected OpenCode Go with an API key, that page is empty. The Go usage endpoint already works with the stored key and returns the real percentages, so this plugin fills that gap without modifying the app.

## Goals

- Show authoritative OpenCode Go usage for the rolling 5-hour, weekly, and monthly windows.
- Put a circular progress indicator in the composer status row, visible while a session is open.
- Open a Claude-style popover card with horizontal meters, percentages, and reset times.
- Provide a full **Go usage** settings page with the same data, refresh, and clear connection states.
- Resolve the active `opencode-go` credential automatically.
- Never log, persist, or return the API key from the main process.
- Keep the last good reading when the network fails, and say when it is stale.

## Non-goals

- Dollar estimates. The Go usage endpoint exposes percentages and reset times, not spend.
- Supporting other providers, Console budgets, or team workspaces in v1. The settings page links to Console for those.
- Replacing or modifying the app's built-in Usage page.
- Notifications or desktop alerts when a limit is close.
- A workspace/account picker. Use the active OpenCode Go credential.
- A TUI plugin. This is desktop-only.
- Modifying the app's built-in Usage page. Console-only accounts get a distinct state that opens Console.

## Constraints and facts

- OpenCode Desktop 2.2.5 exposes the experimental GUI plugin SDK from `@opencode/plugin` 2.2.5.
- The composer footer is not extensible. The closest supported surface is a `ComposerPill` in the row above the composer. Its capsule is host-rendered; the pill text and icon are strings/icon names, not custom JSX.
- `ComposerPill.menu` renders custom JSX in a host-managed popover, including placement, focus, dismissal, and heading. This is where the detailed card lives.
- The pill button gets `data-slot="session-plugin-pill"`, `data-composer-pill`, and `aria-label` equal to the view's `title`. A scoped `Style` contribution can add a `::before` conic-gradient ring to that pill. If the host DOM changes, the text-only pill remains usable.
- The main process has no `ctx.client`. It can reach a server through `ctx.serverEndpoints.get(id)`, whose `url` and `headers` carry the server authentication. The window passes the active session's server id; the default is `"sidecar"`. This works for local and remote servers.
- Credentials are per server. The cache is keyed by server id and credential id, so switching accounts or servers cannot reuse another account's reading.
- The aggregate source order is:

1. The signed-in Console workspace through the app's `GET /api/experimental/usage/limits` endpoint. It returns the workspace (`id`, `name`, `usageURL`) and the same `go` meters.
2. The Go API key endpoint `GET https://opencode.ai/zen/go/v1/usage` when Console is not connected.

The Console endpoint does not expose per-model activity, but the signed-in Console workspace does through `GET /console/api/usage/models?from=YYYY-MM-DD&to=YYYY-MM-DD&pageSize=100` (or `range=30d` when the monthly reset is unknown). The plugin reads that endpoint from the main process using the stored Console OAuth credential and `x-org-id`. The response supplies per-model requests, tokens, and list cost. The **View in Console** action opens the workspace `usageURL`.

The per-model source order is the active server's `/api/credential` first, then the local desktop's `/api/credential` when the active server is remote. A remote server reached over SSH often has no Console sign-in; the desktop's Console account is account-wide and still covers the remote Go usage. The result carries `source: "server" | "desktop"`, and the card labels the desktop fallback.

The same Console credential reads `GET /console/api/billing/credit-invoices`. The latest paid invoice whose `attemptType` starts with `go_` identifies the plan from `product`: `go`, `go-plus`, or `go-teams`. The result carries `plan`, and the card labels it. If the billing read fails, the plugin uses the `plan` option, then defaults to `go`.

The Go usage endpoint uses `Authorization: Bearer <key>`. Response:
  ```json
  {
    "usage": {
      "rolling": { "status": "ok", "percent": 27, "resetsAt": "2026-11-02T10:34:34.000Z" },
      "weekly":  { "status": "ok", "percent": 10, "resetsAt": "2026-11-09T00:00:00.000Z" },
      "monthly": { "status": "ok", "percent": 78, "resetsAt": "2026-11-22T04:08:19.000Z" }
    }
  }
  ```
  `rolling` is the 5-hour window. Percentages are used, not remaining.
- Cloudflare rejects a generic Node/urllib user agent. Every request sends a specific `User-Agent`.
- The app's theme uses `--v2-*` CSS variables. The plugin uses those rather than hard-coded colors where possible.

## Architecture

A GUI-only plugin package named `opencode-go-usage`, installed from a local directory. It has no server part and no TUI part. The `./gui-experimental` export is one prebuilt CommonJS file.

v1 is built and tested on macOS, the user's platform. The sidecar credential path is platform-independent; the legacy `auth.json` fallback is implemented for macOS/Linux, and Windows relies on the sidecar path. Remote servers are supported through the active session's server id; the usage request still runs from the local main process.

```
src/
  contract.ts        Ipc definition and shared types
  usage.ts           pure parsing, clamping, formatting, selection
  usage.test.ts      unit tests
  main.ts            main-process credential lookup, fetch, cache
  gui.tsx            Plugin.define: setup + main
  state.ts           reactive usage store and 60s poll
  pill.tsx           ComposerPill view and popover card
  ring.tsx           SVG ring and CSS-variable ring helper
  settings.tsx       Go usage settings page
  styles.ts          scoped CSS for the pill ring
```

### Main process

`main(ctx)` provides one Ipc, `opencode-go-usage.data`, with a `get({ server?, force? })` method.

On each call:

1. Resolve the server endpoint from `ctx.serverEndpoints.get(server ?? "sidecar")`. If the endpoint is not ready, return `{ state: "unavailable" }` and keep any last good reading.
2. Resolve the credential:
   - `OPENCODE_GO_API_KEY` when set (local testing only).
   - Active `opencode-go` key from `GET {server.url}/api/credential` with the server headers.
   - `~/.local/share/opencode/auth.json` → `opencode-go.key` on macOS/Linux (legacy/CLI fallback).
   - If no key but an active `opencode-go` credential of another type exists, return `{ state: "console-only" }`.
   - Otherwise return `{ state: "signed-out" }`.
3. If a cached success for this server + credential is younger than 60 seconds and `force` is false, return it.
4. Fetch the Go usage endpoint with the key and a plugin-specific user agent.
5. Parse and sanitize into:
   ```ts
   type Window = { percent: number; limited: boolean; resetsAt: number }
   type Usage = {
     windows: { rolling: Window; weekly: Window; monthly: Window }
     updatedAt: number
     stale: boolean
     error?: string
   }
   type Result =
     | { state: "ok"; data: Usage }
     | { state: "signed-out" }
     | { state: "console-only" }
     | { state: "unavailable"; message: string; data?: Usage }
     | { state: "rejected"; message: string }
     | { state: "no-plan"; message: string; data?: Usage }
     | { state: "error"; message: string; data?: Usage }
   ```
6. Cache the result under `serverID + ":" + credentialID` (never the key itself). `force: true` bypasses the cache.

Error mapping:

- **401** — the key is invalid or revoked: `rejected`.
- **403** — the key is valid but has no Go allowance, or the request was blocked before authentication. If the body looks like a Cloudflare challenge/block, return `error`; otherwise return `no-plan` with a Console link. Do not ask the user to reconnect a valid key in a loop.
- Network/parse error — keep the last good reading and return `error` with `data` and `stale: true`.
- Credential endpoint/network failure — `unavailable`, not `signed-out`, so a connected user is not told to reconnect.

The key never leaves this function. It is not included in the Ipc result, logs, or error messages. A hash or credential id may be used for cache keying, but never the key.

### Window

`setup(ctx)`:

- Creates the reactive store (`state.ts`) and starts a 60-second poll through `ctx.main(UsageIpc).get({ server })`.
- The poll uses the active session's `session.server.id`; the settings page also registers a refresh on its own server, defaulting to `sidecar`.
- Registers `ComposerPill`:
  - `id: "usage"`
  - `show` picks the tightest window (highest percent) and returns a compact label: `5h 27%`, `wk 31%`, or `mo 78%`.
  - `tone` is `warning` at ≥70%, `danger` at ≥90% or when limited, otherwise none.
  - `title: "Plan usage limits · Go"` (also the popover heading).
  - `menu` renders the usage card.
- Registers `SettingsPage` with `id: "opencode-go-usage"`, title **Go usage**, icon `window-analytics`, and the full page.
- Registers `Command` **OpenCode Go usage**, opening the settings page. No default keybind.
- Registers `Style` with the scoped pill-ring CSS.
- Updates `--oc-go-usage-percent` and `--oc-go-usage-color` on the document root whenever the tightest reading changes.

### Pill ring

The ring is a 14px circle before the pill label:

```css
[data-slot="session-plugin-pill"][aria-label="Plan usage limits · Go"]::before {
  content: "";
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 50%;
  background: conic-gradient(
    var(--oc-go-usage-color) calc(var(--oc-go-usage-percent) * 1%),
    var(--v2-border-border-muted, rgba(127, 127, 127, 0.25)) 0
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px));
}
```

The pill label carries the same percentage in text, so the ring is never the only signal. If the selector stops matching after an app update, the pill still shows the text.

## UI

### Composer pill

- Appears in the row above the composer, next to the app's activity and todo pills.
- Ring + label, e.g. `5h 27%`.
- Tightest window wins, so a nearly exhausted weekly/monthly cap cannot hide behind a healthy 5-hour number. The short label says which window it is.
- Colors: accent/blue below 70%, amber 70–89%, red at 90%+ or when `limited` is true.
- Clicking opens the host popover.

### Popover card

Host heading: **Plan usage limits · Go**.

Content:

```
5-hour limit                 Resets 6:40 PM    94%
[=========================================---]   (red)

Weekly · all models          Resets Sun 6:00 PM  23%
[====----------------------------------------]   (blue)

Monthly                      Resets 22 Nov 4:08 AM  78%
[==============------------------------------]   (blue)

Updated 2:32 PM                          See all →
```

- Bars are 4px high, rounded, with a muted track.
- Reset times are absolute local times; weekly/monthly include the weekday/date.
- The last row has the last-updated time and a **See all** button. It closes the popover and opens the Go usage settings page.
- Loading: a small `ctx.ui.Loader`.
- Signed out: "OpenCode Go isn't connected" with a button that runs `ctx.commands.run("provider.connect")`; if that returns false, show a toast telling the user to run `/connect`.
- Console-only: "OpenCode Go is connected through Console" with a button that opens the Console URL.
- Rejected: "OpenCode Go rejected the stored key" with a reconnect button.
- No plan: "This key has no OpenCode Go allowance" with a Console link; no reconnect loop.
- Unavailable: "Couldn't check your OpenCode connection" with retry; keep the last reading if there is one.
- Error: "Usage couldn't be loaded" plus the last reading if available, marked stale, and a retry button.

### Settings page

- Header: a 64px ring with the tightest percentage inside, **OpenCode Go**, and the last-updated time.
- Three rows with larger bars (6px), labels, percentages, and reset times.
- **Refresh** button calls `get({ force: true })`; disabled while loading, spinner while busy.
- **View in Console** button opens `https://opencode.ai/console`.
- **View in Console** opens the signed-in workspace's `usageURL`.
- **Connect** runs `ctx.commands.run("provider.connect")`; if it returns false, show a toast telling the user to run `/connect`.
- Same signed-out/console-only/rejected/no-plan/unavailable/error states as the card.

### Model breakdown

The settings page shows a per-model analytics card. When Console is connected, the card uses Console activity for the current Go monthly period, derived from `windows.monthly.resetsAt` and passed as `from`/`to` dates. If the reset is unknown it uses the last 30 days:

```text
GET https://opencode.ai/console/api/usage/models?from=YYYY-MM-DD&to=YYYY-MM-DD&pageSize=100
Authorization: Bearer <Console OAuth token>
x-org-id: <workspace id>
```

The main process selects the active `opencode` OAuth credential from `/api/credential`. The card shows each Go model's Console cost, monthly limit, contribution, requests, and tokens, then:

- **Calculated monthly** = `Σ (Console model cost ÷ model monthly limit)`
- **Server monthly** = `windows.monthly.percent`
- **Difference** = server monthly minus calculated monthly, shown explicitly

The formula is:

```text
model monthly % = Console model cost            ÷ model monthly limit
model 5-hour %  = cost in the current 5h window ÷ (20% of the monthly limit)
model weekly %  = cost in the current UTC week  ÷ (50% of the monthly limit)
total monthly % = Σ model monthly %
```

The plan pool cancels out: `allowance = cost × (plan pool ÷ model limit)`, so `Σ allowance ÷ plan pool` is the same as `Σ cost ÷ model limit`. The pool is `$60` for Go and Go Teams, and `$240` for Go Plus. The 5-hour window starts at the first request after reset; the weekly window is the UTC calendar week.

Per-model limits come from the matching public plan table. Examples: DeepSeek V4.1 Flash is `$100 / $200 / $105` and DeepSeek V4 Pro is `$15 / $60 / $20` for Go / Go Plus / Go Teams.

Console cost includes peak pricing: 2× on weekdays 01:00–04:00 and 06:00–10:00 UTC. The Console Activity table does not split peak and off-peak; the card links to the public pricing table.

The plan-specific tables are the source of truth. The plugin option `plan` is a `"go" | "go-plus" | "go-teams"` fallback when billing detection is unavailable. The plugin option `allowances` is a `Record<modelID, number>` override. The card never infers an allowance to force the server meter to match. If Console is not connected, it falls back to local OpenCode server session stats (`/api/experimental/session/stats`, `tools=none`) and labels the source as local. The local fallback reads model IDs, costs, and token counts only, never prompts or message content.

### States

| State | Pill | Card/page |
| --- | --- | --- |
| Loading | muted ring, `Go usage` | loader |
| OK | ring + tightest `5h 27%` | three meters |
| Limited | red ring, `5h 100%` | "Limit reached" on that row |
| Stale | last reading + muted dot | last reading, "Updated 12m ago", retry |
| Signed out | muted ring, `Go usage` | connect button |
| Console-only | muted ring, `Go usage` | open Console |
| Rejected | red ring, `Go key rejected` | reconnect button |
| No plan | muted ring, `Go usage` | Console link |
| Unavailable | muted ring, `Go usage` | retry; last reading if present |
| Network error | muted ring, `Go usage` | error + retry |

## Refresh and caching

- Window polls every 60 seconds while the plugin is loaded.
- Main caches success for 45 seconds and failures for 45 seconds, keyed by server id and credential id. The success TTL is shorter than the poll so each poll performs a real fetch.
- Manual **Refresh** and **Retry** call `get({ force: true })`, which bypasses both caches.
- Opening the popover or settings page triggers a forced refresh if the reading is older than 30 seconds.
- Reset countdowns are computed in the window from `resetsAt`; no extra network calls.
- Switching accounts on the same server invalidates the cache because the credential id changes. Auth-file and environment keys use a one-way key fingerprint, never the key itself.

## Security and privacy

- The API key is read in the main process and used only for the usage request.
- The key is never returned over Ipc, written to storage, or logged.
- Error messages are fixed strings; raw response bodies are not surfaced.
- The plugin sends no telemetry and no prompts, code, or session data.
- The only network requests are the local sidecar credential read and the Go usage GET.
- The plugin is visible in **Settings › Extensions › Plugins** and can be switched off or removed.

## Testing

Unit tests (`npm test`) cover:

- Parsing the live response shape, including missing/malformed windows.
- Clamping percentages to 0–100.
- Selecting the tightest window and its short label.
- Color/tone thresholds at 69/70/89/90 and limited.
- Reset-time formatting for today, this week, and a future month.
- Error mapping: signed out, 401/403, network failure with and without cache.

Build checks:

- `npm run typecheck`
- `npm run build` emits `dist/gui-experimental.cjs`.
- The bundle does not contain the API key or any credential value.

Manual verification:

- Install the local package, confirm the pill appears in a session.
- Click the pill, confirm the card matches the live endpoint values.
- Open **Go usage** from the command palette and from **See all**.
- Toggle the plugin off in Settings and confirm the pill disappears.
- Simulate a rejected key with a temporary invalid `OPENCODE_GO_API_KEY` and confirm the error state, then remove it.
- Check the desktop log for the absence of key material.

## Install and rollback

Local development:

```sh
npm install
npm run build
```

Add the absolute plugin directory to the global `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugins": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "/path/to/opencode-usage"
  ]
}
```

The desktop app reloads plugins after the config change. `vite build --watch` reloads the GUI bundle on each rebuild. If the plugin is listed but its GUI does not load, check **Settings › Extensions › Plugins** and the desktop log.

Remove the entry from `plugins` to uninstall. `opencode plugin remove` is for published package entries, not local directories.

## Risks

- **Experimental GUI API.** Pin `@opencode/plugin` to 2.2.5 and re-test after app updates.
- **Host pill markup.** The ring depends on the `session-plugin-pill` slot and the pill's `aria-label`. The text label is the fallback.
- **Undocumented Go endpoint.** If it changes, show an error rather than a confident zero.
- **Cloudflare.** A specific user agent is required; do not rely on the default.
- **Credential endpoint.** It returns secrets by design. Keep the key in main and return only sanitized usage.
- **Multiple active credentials.** Use the first active `opencode-go` key credential; the cache is keyed by credential id, so switching accounts does not leak a reading.
- **OAuth/Console-only accounts.** Aggregate meters come from the Console endpoint; per-model data uses the desktop Console account. The UI opens Console for budgets rather than trying to use an OAuth token as a Go API key.
- **403 ambiguity.** Treat a Cloudflare-style 403 as a network error and a plain 403 as no Go allowance; never loop the user through reconnect for a valid key.

## Decisions left to the builder

- Exact component structure and CSS class names.
- Whether to use the app's `ctx.ui` components or plain elements for each piece.
- The precise polling implementation in Solid.
- How to format long reset dates for narrow widths.
- Whether to add a subtle warning titlebar item later.

## Approval checklist

- Ring in the composer pill row, not the composer footer (the footer is not extensible).
- Tightest window shown, with its short label.
- Popover card mirrors Claude's bars, percentages, and reset times.
- Full **Go usage** settings page.
- No dollar estimates.
- Auto-read the active Go key; never expose it.
