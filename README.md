# opencode-go-usage

A Claude-style usage viewer for OpenCode Go inside OpenCode Desktop.

It shows the rolling 5-hour, weekly, and monthly OpenCode Go limits as a circular meter in the composer pill row. Click the pill for a popover with the three meters, reset times, percentages, and a **See all** link. The full **Go usage** page in Settings has the same data plus manual refresh and Console links.

```
composer pill:  ◔ 5h 27%   (ring + tightest window)
popover:        Plan usage limits · Go
                5-hour limit    Resets 6:40 PM    27%
                Weekly          Resets Sun 6:00 PM 18%
                Monthly         Resets 22 Nov      81%
                Updated 2:32 PM              See all →
```

The ring always shows the tightest of the three windows, so a nearly exhausted weekly or monthly cap cannot hide behind a healthy 5-hour number. It turns amber at 70% and red at 90% or when the plan reports a limit.

## Screenshots

### Composer popover

![Usage popover in the composer](docs/screenshots/popover.png)

### Settings

![Go Teams usage in Settings](docs/screenshots/settings.png)

The popover shows the plan name and all three meters. Settings shows the same meters with the Console model breakdown.

## What it reads

The plugin uses the active `opencode-go` API key that OpenCode already stores. It calls:

```
GET https://opencode.ai/zen/go/v1/usage
```

The response contains `rolling`, `weekly`, and `monthly` percentages and reset times. This is the same data the Go console shows; the plugin does not estimate spend.

When the desktop app is signed in to OpenCode Console, the plugin prefers the app's `/api/experimental/usage/limits` endpoint. It returns the Console workspace and the same Go meters, so the aggregate meters and the **View in Console** link follow the signed-in workspace. If Console is not connected, the plugin falls back to the Go API key endpoint.

The plugin also reads the Console per-model activity endpoint from the same signed-in workspace:

```text
GET https://opencode.ai/console/api/usage/models?from=YYYY-MM-DD&to=YYYY-MM-DD&pageSize=100
```

It returns requests, tokens, and list cost per model. Those costs feed the per-model card. The Console token never leaves the main process and is never returned to the window.

The **Usage projection** card reads `GET /api/activity/go` for the current Go period's daily activity. It uses the server's monthly meter for the current percentage, distributes that percentage across the daily Console costs, and plots the cumulative line, a linear month-end forecast, and the 100% monthly limit. It does not divide cost by a plan price or a dollar pool.

If the active server is remote (for example, an OpenCode instance reached over SSH) and that server has no Console sign-in, the plugin falls back to **this desktop's** Console account. The card labels that source as `via this desktop`. The Console activity is account-wide, so it still covers the remote Go usage; the server meters remain the remote server's meters.

## Model breakdown

When Console is connected, the card uses Console activity for the **current Go monthly period** (falling back to the last 30 days if the reset is unknown). It shows each Go model's Console cost, monthly limit, contribution, requests, tokens, average cost per 1M tokens, and average cost per request, then:

- **Calculated monthly** — the sum of `model cost ÷ model monthly limit`
- **Server monthly** — the meter returned by the Go usage endpoint
- **Difference** — shown explicitly, for example `+2.9 pts`

How the percentages are calculated:

```text
model monthly % = Console model cost            ÷ model monthly limit
model 5-hour %  = cost in the current 5h window ÷ (20% of the monthly limit)
model weekly %  = cost in the current UTC week  ÷ (50% of the monthly limit)
total monthly % = Σ model monthly %
```

Each model has its own monthly limit. The calculated monthly total is `Σ (Console cost ÷ that model's monthly limit)`; there is no shared dollar pool. The plan price is not a usage pool. Console buckets model usage by calendar day, so the first day is prorated from the exact Go period start (for example, the plan upgrade time) to avoid counting usage from before the period began.

The 5-hour window starts at the first request after reset, not a fixed trailing 5 hours. The weekly window is the UTC calendar week, not a trailing 7 days.

Console cost includes peak pricing: **2× on weekdays 01:00–04:00 and 06:00–10:00 UTC**. The Console Activity table shows one aggregate cost per model; it does not split peak and off-peak.

The plugin auto-detects **Go**, **Go Plus**, or **Go Teams** from the latest paid `go_*` invoice at `/api/billing/credit-invoices`. Each plan has its own per-model limits, for example:

| Model | Go | Go Plus | Go Teams |
|---|---:|---:|---:|
| DeepSeek V4.1 Flash | $100 | $200 | $105 |
| DeepSeek V4 Pro | $15 | $60 | $20 |

If the billing endpoint is unavailable, set the `plan` option. The full tables are in the [public Go pricing page](https://opencode.ai/v2/docs/console/go#usage-limits).

Overrides require the object form of the plugin entry:

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-go-usage",
      "options": {
        "plan": "go-teams",
        "allowances": {
          "deepseek-v4.1-flash": 105,
          "deepseek-v4-pro": 20
        }
      }
    }
  ]
}
```

If the calculated total and the server monthly meter differ, the card shows both numbers. The server meter is authoritative; the card does not fabricate a matching allowance. The model card prorates the first calendar day from the exact Go period start, so usage before an upgrade is excluded; remaining differences are meter rounding. When Console is not connected, the card falls back to this server's local session stats and labels the source as local. Local spend can miss other clients and models whose cost was not recorded.

## Install

Clone and build the plugin:

```sh
git clone https://github.com/Jerit3787/opencode-go-usage.git
cd opencode-go-usage
npm install
npm run build
```

Add the absolute plugin directory to the global `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugins": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "/absolute/path/to/opencode-go-usage"
  ]
}
```

Replace `/absolute/path/to/opencode-go-usage` with the directory you cloned into.

OpenCode reloads plugins after the config change. No app restart is needed. For local development, `npm run watch` rebuilds the GUI bundle and the app reloads it on each change.

The plugin is listed under **Settings › Extensions › Plugins**. Turn it off there to hide it without removing the config entry.

## Uninstall

Remove the plugin directory entry from `plugins` in `~/.config/opencode/opencode.jsonc`. `opencode plugin remove` is for published package entries, not local directories.

## Privacy

- The Go API key and Console OAuth token are read in the Electron main process.
- The Go key is used only for the Go usage GET. The Console token is used only for the Console usage GETs.
- Neither secret is returned to the window, written to plugin storage, or logged.
- The plugin sends no telemetry, prompts, code, or session content.
- The only requests are the local OpenCode credential read, the local session-stats read, the local Console usage-limits read, the Console per-model usage reads, the Console Go activity read, the Console billing-invoice read, and the Go usage GET.
- The model breakdown reads only model IDs, costs, and token counts; it never reads prompts or message content.
- Only percentages, reset times, model spend, and token counts are displayed.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
npm run watch
```

The GUI bundle is `dist/gui-experimental.cjs`, built with the OpenCode GUI plugin preset.

## Compatibility

OpenCode Desktop 2.2.5+ and the experimental `@opencode/plugin` 2.2.5 GUI API. The pill ring is drawn with a scoped CSS `::before`; if a future app version changes the host pill markup, the pill falls back to its text percentage while the popover and Settings page continue to work.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the release history.

**0.1.3** (2026-11-09) — prorates the first model day from the exact Go start.

**0.1.2** (2026-11-09) — aligns the usage projection with the server meter and fixes the model range.

**0.1.1** (2026-11-08) — marks the projected 100% crossing on the usage graph.

**0.1.0** (2026-11-06) — initial release: Go/Go Plus/Go Teams meters, Console model breakdown, and usage projection graph.
