import { For, Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { cardStyle, rowStyle } from "./layout"
import type { UsageState } from "./state"
import {
  clampPercent,
  dataOf,
  formatPercent1,
  formatTokens,
  formatUnitUSD,
  formatUSD,
  modelAllowance,
  usageColor,
  usageTone,
  windowPercent,
  type ConsoleModelUsage,
} from "./usage"

const MODEL_COLORS = [
  "var(--v2-text-text-accent)",
  "var(--v2-state-fg-warning)",
  "var(--v2-state-fg-success, #2e9e5b)",
  "var(--v2-state-fg-danger)",
  "var(--v2-text-text-base)",
]

type Row = {
  model: ConsoleModelUsage
  limit: number | undefined
  percent: number | undefined
  color: string
}

function formatDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`
}

function ConsoleRow(props: { row: Row }) {
  const percent = () => props.row.percent
  const width = () => `${clampPercent(percent() ?? 0)}%`
  const percentColor = () =>
    percent() === undefined ? "var(--v2-text-text-muted)" : usageColor(usageTone(percent()!, false))
  const perMillion = () =>
    props.row.model.tokens > 0
      ? (props.row.model.cost / props.row.model.tokens) * 1_000_000
      : undefined
  const perRequest = () =>
    props.row.model.requests > 0
      ? props.row.model.cost / props.row.model.requests
      : undefined

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
                background: props.row.color,
                flex: "none",
              }}
            />
            {props.row.model.name}
          </span>
          <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
            {formatUSD(props.row.model.cost)} Console
            {props.row.limit
              ? ` · ${formatUSD(props.row.limit)}/mo limit`
              : " · no published limit"}
          </span>
        </div>
        <div style={{ display: "grid", gap: "3px", "text-align": "right" }}>
          <span style={{ "font-size": "13px", "font-weight": 600, color: percentColor() }}>
            {percent() !== undefined ? formatPercent1(percent()!) : "—"}
          </span>
          <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
            contribution
          </span>
        </div>
      </div>

      <Show when={percent() !== undefined}>
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
              background: props.row.color,
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
        <span>{formatTokens(props.row.model.tokens)} tokens</span>
        <span>{props.row.model.requests.toLocaleString("en-US")} requests</span>
        <Show when={perMillion() !== undefined}>
          <span>avg {formatUnitUSD(perMillion()!)} / 1M tokens</span>
        </Show>
        <Show when={perRequest() !== undefined}>
          <span>avg {formatUnitUSD(perRequest()!)} / request</span>
        </Show>
        <Show when={props.row.limit === undefined}>
          <span>excluded from total</span>
        </Show>
      </div>
    </div>
  )
}

export function ConsoleBreakdown(props: { state: UsageState; ctx: Context }) {
  const data = () => {
    const result = props.state.consoleModels()
    return result?.state === "ok" ? result.data : undefined
  }
  const overrides = () => {
    const value = props.ctx.options.allowances
    if (!value || typeof value !== "object") return {}
    const allowances: Record<string, number> = {}
    for (const [modelID, amount] of Object.entries(value)) {
      if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
        allowances[modelID] = amount
      }
    }
    return allowances
  }
  const rows = (): Row[] => {
    return (data()?.models ?? [])
      .map((model, index) => {
        const limit = modelAllowance(model.modelID, overrides())
        return {
          model,
          limit,
          percent: windowPercent(model.cost, limit, "monthly"),
          color: MODEL_COLORS[index % MODEL_COLORS.length],
        }
      })
      .filter((row) => row.limit !== undefined || row.model.cost > 0)
  }
  const limitedRows = () => rows().filter((row) => row.limit !== undefined)
  const calculated = () =>
    limitedRows().reduce((total, row) => total + (row.percent ?? 0), 0)
  const server = () => dataOf(props.state.result())?.windows.monthly.percent
  const delta = () => {
    const current = server()
    return current === undefined ? undefined : current - calculated()
  }
  const deltaColor = () =>
    delta() === undefined || Math.abs(delta()!) < 0.05
      ? "var(--v2-text-text-muted)"
      : "var(--v2-state-fg-warning)"
  const excluded = () => rows().filter((row) => row.limit === undefined).length
  const totalCost = () => data()?.totalCost ?? 0

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
            {data()?.source === "desktop"
              ? "Console account · last 30 days · via this desktop"
              : "Console spend · last 30 days"}
          </div>
        </div>
        <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)" }}>
          Server monthly {server() !== undefined ? formatPercent1(server()!) : "—"}
        </div>
      </div>

      <Show
        when={rows().length > 0}
        fallback={
          <div
            style={{
              ...rowStyle,
              "font-size": "12px",
              color: "var(--v2-text-text-muted)",
            }}
          >
            No OpenCode Go model usage in the last 30 days.
          </div>
        }
      >
        <For each={rows()}>{(row) => <ConsoleRow row={row} />}</For>

        <div style={{ ...rowStyle, display: "grid", gap: "8px" }}>
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
                Calculated from Console
              </span>
              <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
                {formatUSD(totalCost())} Console · sum of cost ÷ model limit
              </span>
            </div>
            <div style={{ display: "grid", gap: "3px", "text-align": "right" }}>
              <span
                style={{
                  "font-size": "13px",
                  "font-weight": 600,
                  color: "var(--v2-text-text-base)",
                }}
              >
                {formatPercent1(calculated())}
              </span>
              <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
                calculated monthly
              </span>
            </div>
          </div>

          <div
            style={{
              height: "6px",
              background: "var(--v2-border-border-muted)",
              "border-radius": "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${clampPercent(calculated())}%`,
                height: "100%",
              }}
            >
              <For each={limitedRows()}>
                {(row) => (
                  <div
                    style={{
                      width: `${calculated() > 0 ? ((row.percent ?? 0) / calculated()) * 100 : 0}%`,
                      height: "100%",
                      background: row.color,
                    }}
                  />
                )}
              </For>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              "justify-content": "space-between",
              "align-items": "baseline",
              gap: "12px",
              "font-size": "11px",
            }}
          >
            <span style={{ color: "var(--v2-text-text-muted)" }}>Server monthly</span>
            <span style={{ color: "var(--v2-text-text-base)", "font-weight": 530 }}>
              {server() !== undefined ? formatPercent1(server()!) : "—"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              "justify-content": "space-between",
              "align-items": "baseline",
              gap: "12px",
              "font-size": "11px",
            }}
          >
            <span style={{ color: "var(--v2-text-text-muted)" }}>Difference</span>
            <span style={{ color: deltaColor(), "font-weight": 600 }}>
              {delta() !== undefined ? formatDelta(delta()!) : "—"}
            </span>
          </div>
          <Show when={excluded() > 0}>
            <span style={{ "font-size": "11px", color: "var(--v2-text-text-faint)" }}>
              {excluded()} model{excluded() === 1 ? "" : "s"} without a published limit
              excluded from the total.
            </span>
          </Show>
        </div>
      </Show>

    </div>
  )
}
