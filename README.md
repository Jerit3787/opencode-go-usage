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

When the desktop app is signed in to OpenCode Console, the plugin prefers the app's `/api/experimental/usage/limits` endpoint. It returns the Console workspace and the same Go meters, so the aggregate meters and the **View in Console** link follow the signed-in workspace. If Console is not connected, the plugin falls back to the Go API key endpoint. The Console endpoint does not expose per-model activity, so the model breakdown remains this server's local session stats.

The built-in OpenCode Usage page also uses the Console workspace. If the active credential is Console/OAuth only, the plugin can still show the aggregate meters from the Console endpoint; the per-model card notes that its numbers are local.

## Model breakdown

The Go usage endpoint returns one set of window meters. The **Go usage** settings page also reads the local OpenCode server's session stats and shows each Go model's usage for the current allowance period:

- local spend, token count, and the model's monthly allowance
- the model's share of its 5-hour, weekly, and monthly allowances
- a **Local pooled total** row that sums the model percentages

How the percentages are calculated:

```text
model monthly % = model spend this period      ÷ model monthly allowance
model 5-hour %  = model spend in the last 5h   ÷ (20% of the monthly allowance)
model weekly %  = model spend in the last 7d   ÷ (50% of the monthly allowance)
total monthly % = Σ model monthly %
```

Allowances are pooled in percentage terms: a model at 50% of its allowance plus another model at 50% of its allowance is 100% of the monthly pool. The server meters at the top of the page are the account total and can include other machines or clients; the **Local pooled total** is this server's contribution.

The percentages use **recorded cost**, not token count. A free, promotional, or unpriced model can show millions of tokens at $0.00 and contribute 0%.

The defaults are **DeepSeek V4.1 Flash $100** and **DeepSeek V4 Pro $20**. The [public Go table](https://opencode.ai/v2/docs/console/go#usage-limits) currently lists V4 Pro at $15, so the defaults are deliberately overridable: set the `allowances` option to match your workspace. The settings card links to the current table.

Overrides require the object form of the plugin entry:

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-go-usage",
      "options": {
        "allowances": {
          "deepseek-v4.1-flash": 100,
          "deepseek-v4-pro": 20
        }
      }
    }
  ]
}
```

If the **Local pooled total** and the server monthly meter differ, the server meter includes usage from other clients or machines, or the recorded local cost is not the full allowance cost. The local card does not fabricate a matching total; it shows both numbers. Use your workspace's actual allowance values in the override if the table is the issue.

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
- The only requests are the local OpenCode credential read, the local session-stats read, the local Console usage-limits read, and the Go usage GET.
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
