import { Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { MeterRow } from "./meter"
import { Ring } from "./ring"
import { StatusBlock } from "./status"
import type { UsageState } from "./state"
import {
  dataOf,
  formatPercent,
  formatUpdated,
  statusCopy,
  tightestWindow,
  usageColor,
  usageTone,
} from "./usage"

export function UsageSettings(props: { state: UsageState; ctx: Context }) {
  const ui = props.ctx.ui
  const data = () => dataOf(props.state.result())
  const copy = () => statusCopy(props.state.result())

  const tightest = () => {
    const current = data()
    if (!current) return undefined
    const { window } = tightestWindow(current)
    return {
      window,
      tone: usageTone(window.percent, window.limited),
    }
  }

  const updated = () => {
    const current = data()
    return current ? formatUpdated(current.updatedAt, Date.now()) : "Waiting for usage"
  }

  const run = () => {
    switch (copy().action) {
      case "connect":
        props.state.connect()
        break
      case "usage":
        props.state.openBuiltinUsage()
        break
      case "console":
        props.state.openConsole()
        break
      case "retry":
        void props.state.refresh({ force: true })
        break
      case "none":
        break
    }
  }

  return (
    <div style={{ display: "grid", gap: "20px", "max-width": "720px" }}>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "16px",
          "flex-wrap": "wrap",
        }}
      >
        <Show
          when={tightest()}
          fallback={
            <div
              style={{
                width: "64px",
                height: "64px",
                "border-radius": "50%",
                background: "var(--v2-background-bg-layer-01)",
              }}
            />
          }
        >
          {(entry) => (
            <Ring
              percent={entry().window.percent}
              size={64}
              stroke={6}
              color={usageColor(entry().tone)}
              label={formatPercent(entry().window.percent)}
            />
          )}
        </Show>

        <div style={{ display: "grid", gap: "4px", flex: 1, "min-width": "180px" }}>
          <div
            style={{
              "font-size": "15px",
              "font-weight": 600,
              color: "var(--v2-text-text-base)",
            }}
          >
            OpenCode Go
          </div>
          <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)" }}>
            {updated()}
          </div>
        </div>

        <ui.Button
          variant="neutral"
          icon="refresh"
          busy={props.state.loading()}
          onClick={() => void props.state.refresh({ force: true })}
        >
          Refresh
        </ui.Button>
      </div>

      <Show
        when={data()}
        fallback={
          <StatusBlock copy={copy()} run={run} loading={props.state.loading()} ui={ui} />
        }
      >
        {(current) => (
          <div style={{ display: "grid", gap: "16px" }}>
            <Show when={current().stale}>
              <div
                style={{
                  "font-size": "12px",
                  color: "var(--v2-state-fg-warning)",
                }}
              >
                Showing the last reading.
              </div>
            </Show>

            <MeterRow
              size="large"
              label="5-hour limit"
              window={current().windows.rolling}
              now={Date.now()}
            />
            <MeterRow
              size="large"
              label="Weekly · all models"
              window={current().windows.weekly}
              now={Date.now()}
            />
            <MeterRow
              size="large"
              label="Monthly"
              window={current().windows.monthly}
              now={Date.now()}
            />

            <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
              <ui.Button variant="neutral" onClick={props.state.openConsole}>
                View in Console
              </ui.Button>
              <ui.Button variant="ghost" onClick={props.state.openBuiltinUsage}>
                Open built-in Usage
              </ui.Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
