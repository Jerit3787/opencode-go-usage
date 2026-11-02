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

The built-in OpenCode Usage page depends on a Console workspace sign-in. This plugin is for the API-key path. If the active credential is Console/OAuth only, the popover points you to the built-in Usage page instead of showing a false "not connected" state.

## Model breakdown

The Go usage endpoint returns one set of window meters. The **Go usage** settings page also reads the local OpenCode server's session stats and shows each Go model's usage for the current allowance period:

- local spend, token count, and the model's monthly allowance
- the model's share of its 5-hour, weekly, and monthly allowances
- a server-implied allowance for the local spend when the server monthly meter is available

How the percentages are calculated:

```text
monthly % = model spend this period      ÷ model monthly allowance
5-hour %  = model spend in the last 5h   ÷ (20% of the monthly allowance)
weekly %  = model spend in the last 7d   ÷ (50% of the monthly allowance)
```

Allowances are **per model** and do not transfer. Each percentage stands on its own: two models at 50% are each half-used, not 100% of one combined monthly limit. The server meters at the top of the page are separate and can include other machines or clients.

Published Go allowances are used as defaults. If your workspace has different limits, override them in the plugin options. This requires the object form of the plugin entry:

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-go-usage",
      "options": {
        "allowances": {
          "deepseek-v4.1-flash": 100,
          "deepseek-v4-pro": 16
        }
      }
    }
  ]
}
```

The settings page shows a **server-implied allowance for local spend** when both the server monthly meter and the local spend are available. If that differs from the published table, use your workspace's actual value in the override.

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

- The API key is read in the Electron main process.
- It is used only for the Go usage GET.
- It is never returned to the window, written to plugin storage, or logged.
- The plugin sends no telemetry, prompts, code, or session content.
- The only requests are the local OpenCode credential read, the local session-stats read, and the Go usage GET.
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
