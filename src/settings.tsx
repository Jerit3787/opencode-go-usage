import { onMount, Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { MeterRow } from "./meter"
import { Ring } from "./ring"
import { InlineNotice, StatusBlock } from "./status"
import type { UsageState } from "./state"
import {
  dataOf,
  formatPercent,
  formatUpdated,
  noticeFor,
  statusCopy,
  tightestWindow,
  usageColor,
  usageTone,
} from "./usage"

const cardStyle = {
  background: "var(--v2-background-bg-layer-01)",
  "box-shadow": "inset 0 0 0 0.5px var(--v2-border-border-muted)",
  "border-radius": "8px",
  "padding-inline": "20px",
}

const rowStyle = {
  "border-top": "0.5px solid var(--v2-border-border-muted)",
  "padding-block": "16px",
  "padding-inline": "16px",
}

export function UsageSettings(props: { state: UsageState; ctx: Context }) {
  const ui = props.ctx.ui
  const data = () => dataOf(props.state.result())
  const copy = () => statusCopy(props.state.result())
  const notice = () => noticeFor(props.state.result())

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
    if (!current) return "Waiting for usage"
    const label = formatUpdated(current.updatedAt, Date.now())
    return current.stale ? `${label} · last reading` : label
  }

  onMount(() => {
    if (props.state.loading()) return
    const current = dataOf(props.state.result())
    if (!current) void props.state.refresh()
    else if (Date.now() - current.updatedAt > 30_000) void props.state.refresh({ force: true })
  })

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
    <div style={{ display: "flex", "flex-direction": "column", "min-height": "100%" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          "z-index": 10,
          background: "var(--v2-background-bg-base)",
          padding: "40px 0 0",
        }}
      >
        <div
          style={{
            display: "flex",
            "justify-content": "space-between",
            "align-items": "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              "font-size": "15px",
              "font-weight": 640,
              "line-height": "var(--line-height-base)",
              color: "var(--v2-text-text-base)",
            }}
          >
            Go usage
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
      </div>

      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "32px",
          padding: "16px 0 40px",
        }}
      >
        <div
          style={{
            "font-size": "13px",
            "line-height": "1.45",
            color: "var(--v2-text-text-muted)",
          }}
        >
          Your OpenCode Go limits and reset times.
        </div>

        <Show when={notice()}>
          {(notice) => <InlineNotice copy={notice()} run={run} />}
        </Show>

        <Show
          when={data()}
          fallback={
            <div style={cardStyle}>
              <div style={{ padding: "16px 16px" }}>
                <StatusBlock
                  copy={copy()}
                  run={run}
                  loading={props.state.loading()}
                  ui={ui}
                />
              </div>
            </div>
          }
        >
          {(current) => (
            <div style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "16px",
                  "padding-block": "16px",
                  "padding-inline": "16px",
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
                        background: "var(--v2-background-bg-layer-02)",
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

                <div style={{ display: "grid", gap: "4px", flex: 1, "min-width": 0 }}>
                  <div
                    style={{
                      "font-size": "15px",
                      "font-weight": 600,
                      color: "var(--v2-text-text-base)",
                    }}
                  >
                    OpenCode Go
                  </div>
                  <div
                    style={{
                      "font-size": "12px",
                      color: "var(--v2-text-text-muted)",
                    }}
                  >
                    {updated()}
                  </div>
                </div>
              </div>

              <div style={rowStyle}>
                <MeterRow
                  size="large"
                  label="5-hour limit"
                  window={current().windows.rolling}
                  now={Date.now()}
                />
              </div>
              <div style={rowStyle}>
                <MeterRow
                  size="large"
                  label="Weekly · all models"
                  window={current().windows.weekly}
                  now={Date.now()}
                />
              </div>
              <div style={rowStyle}>
                <MeterRow
                  size="large"
                  label="Monthly"
                  window={current().windows.monthly}
                  now={Date.now()}
                />
              </div>

              <div
                style={{
                  ...rowStyle,
                  display: "flex",
                  "justify-content": "flex-end",
                  gap: "8px",
                  "flex-wrap": "wrap",
                  "padding-block": "12px 16px",
                }}
              >
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
    </div>
  )
}
