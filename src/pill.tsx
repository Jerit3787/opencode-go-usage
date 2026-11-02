import type { ComposerPill, Context } from "@opencode/plugin/gui"
import { UsageCard } from "./card"
import type { UsageState } from "./state"
import { pillView } from "./usage"

export const USAGE_TITLE = "Plan usage limits · Go"

export function usagePill(ctx: Context, state: UsageState): ComposerPill {
  return {
    id: "usage",
    order: 0,
    show: () => {
      const view = pillView(state.result())
      return {
        label: view.stale ? `${view.label} ·` : view.label,
        title: USAGE_TITLE,
        tone: view.tone,
      }
    },
    menu: (input) => (
      <UsageCard
        state={state}
        ctx={ctx}
        close={input.close}
        onSeeAll={() => {
          input.close()
          state.openSettings()
        }}
      />
    ),
  }
}
