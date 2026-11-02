import { createEffect, onCleanup } from "solid-js"
import { Command, ComposerPill, Plugin, SettingsPage, Style } from "@opencode/plugin/gui"
import { main } from "./main"
import { usagePill } from "./pill"
import { UsageSettings } from "./settings"
import { createUsageState } from "./state"
import { usageStyles } from "./styles"
import { clampPercent, dataOf, tightestWindow, usageColor, usageTone } from "./usage"

export default Plugin.define({
  setup(ctx) {
    const state = createUsageState(ctx)
    ctx.add(ComposerPill, usagePill(ctx, state))
    ctx.add(Style, usageStyles)

    ctx.add(SettingsPage, {
      id: "opencode-go-usage",
      icon: "window-analytics",
      get title() {
        return "Go usage"
      },
      entries: [
        {
          id: "usage",
          title: "Go usage",
          description: "OpenCode Go limits and reset times",
          keywords: "usage limits go subscription",
        },
      ],
      render: () => <UsageSettings state={state} ctx={ctx} />,
    })

    ctx.add(Command, {
      id: "open",
      title: "OpenCode Go usage",
      description: "See your Go 5-hour, weekly, and monthly limits",
      group: "View",
      run: () => ctx.layout.settings("opencode-go-usage"),
    })

    createEffect(() => {
      const data = dataOf(state.result())
      const root = document.documentElement
      if (!data) {
        root.style.setProperty("--oc-go-usage-percent", "0")
        root.style.setProperty("--oc-go-usage-color", "var(--v2-text-text-muted)")
        return
      }

      const { window } = tightestWindow(data)
      root.style.setProperty("--oc-go-usage-percent", String(clampPercent(window.percent)))
      root.style.setProperty(
        "--oc-go-usage-color",
        usageColor(usageTone(window.percent, window.limited)),
      )
    })

    onCleanup(() => {
      document.documentElement.style.removeProperty("--oc-go-usage-percent")
      document.documentElement.style.removeProperty("--oc-go-usage-color")
    })
  },
  main,
})
