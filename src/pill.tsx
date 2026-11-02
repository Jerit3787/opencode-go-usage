import type { ComposerPill, Context } from "@opencode/plugin/gui"
import { UsageCard } from "./card"
import type { UsageState } from "./state"
import { USAGE_TITLE } from "./title"
import { pillView } from "./usage"

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
        onSeeAll={() => {
          input.close()
          state.openSettings()
        }}
      />
    ),
  }
}
