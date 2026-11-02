import type { ComposerPill, Context } from "@opencode/plugin/gui"
import type { UsageState } from "./state"
import { pillView } from "./usage"

export const USAGE_TITLE = "Plan usage limits · Go"

export function usagePill(ctx: Context, state: UsageState): ComposerPill {
  return {
    id: "usage",
    order: 0,
    show: () => {
      const view = pillView(state.result())
      return { label: view.label, title: USAGE_TITLE, tone: view.tone }
    },
    menu: () => (
      <div style={{ padding: "8px", color: "var(--v2-text-text-muted)", "font-size": "12px" }}>
        Usage card
      </div>
    ),
  }
}
