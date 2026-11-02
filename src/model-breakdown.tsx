import { For, Show } from "solid-js"
import type { Context, Ui } from "@opencode/plugin/gui"
import { cardStyle, rowStyle } from "./layout"
import type { UsageState } from "./state"
import {
  clampPercent,
  dataOf,
  formatPercent1,
  formatTokens,
  formatUSD,
  modelAllowance,
  totalModelPercent,
  usageColor,
  usageTone,
  windowPercent,
  type ModelUsage,
} from "./usage"

function ModelRow(props: { model: ModelUsage; allowance: number | undefined }) {
  const monthlyPct = () =>
    windowPercent(props.model.monthlyCost, props.allowance, "monthly")
  const weeklyPct = () => windowPercent(props.model.weeklyCost, props.allowance, "weekly")
  const rollingPct = () => windowPercent(props.model.rollingCost, props.allowance, "rolling")
  const tone = () => {
    const percent = monthlyPct()
    return percent === undefined ? "none" : usageTone(percent, false)
  }
  const color = () => usageColor(tone())
  const width = () => `${clampPercent(monthlyPct() ?? 0)}%`

  return (
    <div style={rowStyle}>
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "baseline",
          gap: "12px",
        }}
      >
        <div style={{ display: "grid", gap: "3px", "min-width": 0 }}>
          <span
            style={{
              "font-size": "13px",
              "font-weight": 530,
              color: "var(--v2-text-text-base)",
            }}
          >
            {props.model.name}
          </span>
          <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
            {formatUSD(props.model.monthlyCost)} this period
            {props.allowance ? ` · ${formatUSD(props.allowance)}/mo allowance` : ""}
          </span>
        </div>
        <div style={{ display: "grid", gap: "3px", "text-align": "right" }}>
          <span style={{ "font-size": "13px", "font-weight": 600, color: color() }}>
            {monthlyPct() !== undefined ? formatPercent1(monthlyPct()!) : "—"}
          </span>
          <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
            of monthly
          </span>
        </div>
      </div>

      <Show when={monthlyPct() !== undefined}>
        <div
          style={{
            height: "5px",
            "margin-top": "8px",
            background: "var(--v2-border-border-muted)",
            "border-radius": "999px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: width(),
              height: "100%",
              background: color(),
              "border-radius": "999px",
            }}
          />
        </div>
      </Show>

      <div
        style={{
          display: "flex",
          gap: "12px",
          "flex-wrap": "wrap",
          "margin-top": "6px",
          "font-size": "11px",
          color: "var(--v2-text-text-faint)",
        }}
      >
        <span>5h {rollingPct() !== undefined ? formatPercent1(rollingPct()!) : "—"}</span>
        <span>wk {weeklyPct() !== undefined ? formatPercent1(weeklyPct()!) : "—"}</span>
        <span>{formatTokens(props.model.monthlyTokens)} tokens</span>
      </div>
    </div>
  )
}

export function ModelBreakdown(props: { state: UsageState; ctx: Context; ui: Ui }) {
  const ui = props.ui
  const analytics = () => {
    const result = props.state.models()
    return result?.state === "ok" ? result.data : undefined
  }
  const models = () => analytics()?.models ?? []
  const total = () => analytics()?.totalMonthlyCost ?? 0
  const serverMonthly = () =>
    dataOf(props.state.result())?.windows.monthly.percent ??
    analytics()?.serverMonthlyPercent ??
    0
  const overrides = () => {
    const value = props.ctx.options.allowances
    if (!value || typeof value !== "object") return {}
    const allowances: Record<string, number> = {}
    for (const [modelID, amount] of Object.entries(value)) {
      if (typeof amount === "number" && Number.isFinite(amount)) {
        allowances[modelID] = amount
      }
    }
    return allowances
  }
  const totalMonthly = () => totalModelPercent(models(), overrides(), "monthly")
  const totalWeekly = () => totalModelPercent(models(), overrides(), "weekly")
  const totalRolling = () => totalModelPercent(models(), overrides(), "rolling")
  const totalTone = () => usageTone(totalMonthly(), false)
  const modelError = () => {
    const result = props.state.models()
    return result?.state === "error" ? result.message : undefined
  }
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "baseline",
          gap: "16px",
          padding: "16px 16px",
        }}
      >
        <div style={{ display: "grid", gap: "3px" }}>
          <div
            style={{
              "font-size": "15px",
              "font-weight": 600,
              color: "var(--v2-text-text-base)",
            }}
          >
            Model breakdown
          </div>
          <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)" }}>
            Local usage in this allowance period.
          </div>
        </div>
        <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)" }}>
          Server monthly {serverMonthly() > 0 ? formatPercent1(serverMonthly()) : "—"}
        </div>
      </div>

      <Show
        when={models().length > 0}
        fallback={
          <div
            style={{
              ...rowStyle,
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "12px",
              "font-size": "12px",
              color: "var(--v2-text-text-muted)",
            }}
          >
            <Show
              when={!props.state.modelsLoading()}
              fallback={
                <span style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                  <ui.Loader size="small" />
                  Loading model usage…
                </span>
              }
            >
              <span>{modelError() ?? "No OpenCode Go model usage in this period."}</span>
              <Show when={modelError()}>
                <ui.Button
                  variant="ghost"
                  size="small"
                  onClick={() => void props.state.refreshModels({ force: true })}
                >
                  Retry
                </ui.Button>
              </Show>
            </Show>
          </div>
        }
      >
        <For each={models()}>
          {(model) => (
            <ModelRow
              model={model}
              allowance={modelAllowance(model.modelID, overrides())}
            />
          )}
        </For>

        <div style={{ ...rowStyle, display: "grid", gap: "6px" }}>
          <div
            style={{
              display: "flex",
              "justify-content": "space-between",
              "align-items": "baseline",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "3px" }}>
              <span
                style={{
                  "font-size": "13px",
                  "font-weight": 600,
                  color: "var(--v2-text-text-base)",
                }}
              >
                Local total
              </span>
              <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
                {formatUSD(total())} local
              </span>
            </div>
            <div style={{ display: "grid", gap: "3px", "text-align": "right" }}>
              <span
                style={{
                  "font-size": "13px",
                  "font-weight": 600,
                  color: usageColor(totalTone()),
                }}
              >
                {formatPercent1(totalMonthly())}
              </span>
              <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
                of monthly
              </span>
            </div>
          </div>
          <div
            style={{
              height: "5px",
              background: "var(--v2-border-border-muted)",
              "border-radius": "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${clampPercent(totalMonthly())}%`,
                height: "100%",
                background: usageColor(totalTone()),
                "border-radius": "999px",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: "12px",
              "flex-wrap": "wrap",
              "font-size": "11px",
              color: "var(--v2-text-text-faint)",
            }}
          >
            <span>5h {formatPercent1(totalRolling())}</span>
            <span>wk {formatPercent1(totalWeekly())}</span>
            <span>Pooled monthly percentage</span>
          </div>
        </div>
      </Show>

      <div
        style={{
          "border-top": "0.5px solid var(--v2-border-border-muted)",
          padding: "12px 16px 14px",
          display: "grid",
          gap: "4px",
          "font-size": "11px",
          "line-height": "1.45",
          color: "var(--v2-text-text-faint)",
        }}
      >
        <span>
          Monthly % = model spend ÷ model allowance. 5-hour % = last 5h ÷ 20% of the
          allowance; weekly % = last 7d ÷ 50%.
        </span>
        <span>
          Total monthly % is the sum of the model percentages. 100% means the pooled
          monthly allowance is exhausted.
        </span>
        <span>
          Local rows use this server's sessions; the server meters above include all
          clients and machines.
        </span>
        <span>
          Published Go allowances are used; set the plugin's `allowances` option to
          override a model.
        </span>
      </div>
    </div>
  )
}
