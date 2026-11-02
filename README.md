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

## What it reads

The plugin uses the active `opencode-go` API key that OpenCode already stores. It calls:

```
GET https://opencode.ai/zen/go/v1/usage
```

The response contains `rolling`, `weekly`, and `monthly` percentages and reset times. This is the same data the Go console shows; the plugin does not estimate spend.

When the desktop app is signed in to OpenCode Console, the plugin prefers the app's `/api/experimental/usage/limits` endpoint. It returns the Console workspace and the same Go meters, so the aggregate meters and the **View in Console** link follow the signed-in workspace. If Console is not connected, the plugin falls back to the Go API key endpoint.

The plugin also reads the Console per-model activity endpoint from the same signed-in workspace:

```text
GET https://opencode.ai/console/api/usage/models?range=30d&pageSize=100
```

It returns requests, tokens, and list cost per model. Those costs feed the per-model card. The Console token never leaves the main process and is never returned to the window.

## Model breakdown

When Console is connected, the card uses Console activity for the **last 30 days**. It shows each Go model's Console cost, monthly limit, contribution, requests, and tokens, then:

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

The `$60` Go pool cancels out: `allowance = cost × (60 ÷ model limit)`, so `Σ allowance ÷ 60` is the same as `Σ cost ÷ model limit`.

The 5-hour window starts at the first request after reset, not a fixed trailing 5 hours. The weekly window is the UTC calendar week, not a trailing 7 days.

Console cost includes peak pricing: **2× on weekdays 01:00–04:00 and 06:00–10:00 UTC**. The Console Activity table shows one aggregate cost per model; it does not split peak and off-peak.

The defaults are **DeepSeek V4.1 Flash $100** and **DeepSeek V4 Pro $15**, matching the [public Go table](https://opencode.ai/v2/docs/console/go#usage-limits). Set the `allowances` option if your workspace has different limits.

Overrides require the object form of the plugin entry:

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-go-usage",
      "options": {
        "allowances": {
          "deepseek-v4.1-flash": 100,
          "deepseek-v4-pro": 15
        }
      }
    }
  ]
}
```

If the calculated total and the server monthly meter differ, the card shows both numbers. The server meter is authoritative; the card does not fabricate a matching allowance. When Console is not connected, the card falls back to this server's local session stats and labels the source as local. Local spend can miss other clients and models whose cost was not recorded.

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
- The only requests are the local OpenCode credential read, the local session-stats read, the local Console usage-limits read, the Console per-model usage read, and the Go usage GET.
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
