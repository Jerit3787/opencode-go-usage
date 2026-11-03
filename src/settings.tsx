import { onMount, Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { ConsoleBreakdown } from "./console-breakdown"
import { UsageInfo } from "./info-card"
import { cardStyle, rowStyle } from "./layout"
import { MeterRow } from "./meter"
import { ModelBreakdown } from "./model-breakdown"
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

  const consoleReady = () => {
    const result = props.state.consoleModels()
    return result?.state === "ok" && result.data.models.length > 0 ? result : undefined
  }
  const consoleError = () => {
    const result = props.state.consoleModels()
    return result?.state === "error" ? result.message : undefined
  }

  const updated = () => {
    const current = data()
    if (current) {
      const label = formatUpdated(current.updatedAt, Date.now())
      return current.stale ? `${label} · last reading` : label
    }

    if (props.state.initialLoading()) return "Checking usage…"

    switch (copy().action) {
      case "connect":
        return "Connection needed"
      case "console":
        return "Console managed"
      case "retry":
        return "Unavailable"
      default:
        return "Waiting for usage"
    }
  }

  onMount(() => {
    void props.state.refreshModels()
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
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">Go usage</h2>
            <span class="text-11-regular text-v2-text-text-muted">
              Your OpenCode Go limits and reset times.
            </span>
          </div>
          <div class="settings-tab-header-actions">
            <ui.Button
              variant="neutral"
              icon="refresh"
              busy={
                props.state.loading() ||
                props.state.modelsLoading() ||
                props.state.consoleModelsLoading()
              }
              onClick={() => {
                void props.state.refresh({ force: true })
                void props.state.refreshModels({ force: true })
              }}
            >
              Refresh
            </ui.Button>
          </div>
        </div>
      </div>

      <div class="settings-tab-body settings-tab-body--sectioned">

        <Show when={notice()}>
          {(notice) => <InlineNotice copy={notice()} run={run} />}
        </Show>

        <Show when={consoleError()}>
          {(message) => (
            <div
              style={{
                display: "flex",
                "justify-content": "space-between",
                "align-items": "center",
                gap: "12px",
                padding: "8px 10px",
                "border-radius": "6px",
                background: "var(--v2-background-bg-layer-01)",
                color: "var(--v2-state-fg-warning)",
                "font-size": "11px",
              }}
            >
              <span>
                Console model data unavailable: {message()}. Showing local session data.
              </span>
              <ui.Button
                variant="ghost"
                size="small"
                onClick={() => void props.state.refreshModels({ force: true })}
              >
                Retry
              </ui.Button>
            </div>
          )}
        </Show>

        <Show
          when={data()}
          fallback={
            <div style={cardStyle}>
              <div style={{ padding: "16px 16px" }}>
                <StatusBlock
                  copy={copy()}
                  run={run}
                  loading={props.state.initialLoading()}
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
                  kind="rolling"
                  size="large"
                  label="5-hour limit"
                  window={current().windows.rolling}
                  now={Date.now()}
                />
              </div>
              <div style={rowStyle}>
                <MeterRow
                  kind="weekly"
                  size="large"
                  label="Weekly · all models"
                  window={current().windows.weekly}
                  now={Date.now()}
                />
              </div>
              <div style={rowStyle}>
                <MeterRow
                  kind="monthly"
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
              </div>
            </div>
          )}
        </Show>

        <Show
          when={consoleReady()}
          fallback={<ModelBreakdown state={props.state} ctx={props.ctx} ui={ui} />}
        >
          <ConsoleBreakdown state={props.state} ctx={props.ctx} />
        </Show>

        <UsageInfo ctx={props.ctx} />
      </div>
    </>
  )
}
