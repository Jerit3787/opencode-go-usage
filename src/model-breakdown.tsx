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
  GO_PRICING_URL,
  modelAllowance,
  totalModelPercent,
  usageColor,
  usageTone,
  windowPercent,
  type ModelUsage,
} from "./usage"

const MODEL_COLORS = [
  "var(--v2-text-text-accent)",
  "var(--v2-state-fg-warning)",
  "var(--v2-state-fg-success, #2e9e5b)",
  "var(--v2-state-fg-danger)",
  "var(--v2-text-text-base)",
]

function ModelRow(props: {
  model: ModelUsage
  allowance: number | undefined
  color: string
}) {
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
              display: "inline-flex",
              "align-items": "center",
              gap: "7px",
              "font-size": "13px",
              "font-weight": 530,
              color: "var(--v2-text-text-base)",
              "min-width": 0,
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                "border-radius": "50%",
                background: props.color,
                flex: "none",
              }}
            />
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
            contribution
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
              background: props.color,
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
  const contributions = () =>
    models().map((model, index) => ({
      model,
      percent:
        windowPercent(
          model.monthlyCost,
          modelAllowance(model.modelID, overrides()),
          "monthly",
        ) ?? 0,
      color: MODEL_COLORS[index % MODEL_COLORS.length],
    }))
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
            Local recorded spend in this allowance period.
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
          {(model, index) => (
            <ModelRow
              model={model}
              allowance={modelAllowance(model.modelID, overrides())}
              color={MODEL_COLORS[index() % MODEL_COLORS.length]}
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
                Local pooled total
              </span>
              <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
                {formatUSD(total())} local · sum of model contributions
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
                display: "flex",
                width: `${clampPercent(totalMonthly())}%`,
                height: "100%",
              }}
            >
              <For each={contributions()}>
                {(contribution) => (
                  <div
                    style={{
                      width: `${
                        totalMonthly() > 0
                          ? (contribution.percent / totalMonthly()) * 100
                          : 0
                      }%`,
                      height: "100%",
                      background: contribution.color,
                    }}
                  />
                )}
              </For>
            </div>
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
            <span>Pooled monthly</span>
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
          Percentages use recorded cost, not token count. Free or promotional usage can
          show many tokens at $0 and contribute 0%.
        </span>
        <span>
          Local rows use this server's sessions; the server meters above include all
          clients and machines. If the server is higher than the local pooled total, the
          difference is usage from other clients or allowance cost not recorded here.
        </span>
        <span>
          Allowances default to DeepSeek V4.1 Flash $100 and V4 Pro $20; set the plugin's
          `allowances` option to override either one.
        </span>
        <button
          type="button"
          onClick={() => props.ctx.system.openExternal(GO_PRICING_URL)}
          style={{
            "justify-self": "start",
            border: "none",
            background: "transparent",
            color: "var(--v2-text-text-accent)",
            "font-size": "11px",
            "font-weight": 530,
            padding: 0,
            cursor: "pointer",
          }}
        >
          OpenCode Go pricing ↗
        </button>
      </div>
    </div>
  )
}
