import { onMount, Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { MeterRow } from "./meter"
import type { UsageState } from "./state"
import { dataOf, formatUpdated, statusCopy } from "./usage"

function actionLabel(action: ReturnType<typeof statusCopy>["action"]): string {
  switch (action) {
    case "connect":
      return "Connect OpenCode Go"
    case "usage":
      return "Open built-in Usage"
    case "console":
      return "Open Console"
    case "retry":
      return "Retry"
    case "none":
      return ""
  }
}

export function UsageCard(props: {
  state: UsageState
  ctx: Context
  close(): void
  onSeeAll(): void
}) {
  const ui = props.ctx.ui

  onMount(() => {
    const data = dataOf(props.state.result())
    if (!data || Date.now() - data.updatedAt > 30_000) void props.state.refresh()
  })

  const data = () => dataOf(props.state.result())
  const copy = () => statusCopy(props.state.result())

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
    <div style={{ display: "grid", gap: "12px", padding: "4px" }}>
      <Show
        when={data()}
        fallback={
          <Show
            when={!props.state.loading()}
            fallback={
              <div
                style={{
                  display: "flex",
                  "justify-content": "center",
                  padding: "12px",
                }}
              >
                <ui.Loader size="small" />
              </div>
            }
          >
            <div style={{ display: "grid", gap: "8px", padding: "4px 4px 2px" }}>
              <div
                style={{
                  "font-size": "13px",
                  "font-weight": 590,
                  color: "var(--v2-text-text-base)",
                }}
              >
                {copy().title}
              </div>
              <div
                style={{
                  "font-size": "12px",
                  color: "var(--v2-text-text-muted)",
                  "line-height": "1.45",
                }}
              >
                {copy().body}
              </div>
              <Show when={copy().action !== "none"}>
                <button
                  type="button"
                  onClick={run}
                  style={{
                    "justify-self": "start",
                    "margin-top": "2px",
                    border: "none",
                    "border-radius": "6px",
                    background: "var(--v2-background-bg-button-neutral)",
                    color: "var(--v2-text-text-base)",
                    padding: "6px 10px",
                    "font-size": "12px",
                    "font-weight": 530,
                    cursor: "pointer",
                  }}
                >
                  {actionLabel(copy().action)}
                </button>
              </Show>
            </div>
          </Show>
        }
      >
        {(data) => (
          <div style={{ display: "grid", gap: "12px" }}>
            <MeterRow label="5-hour limit" window={data().windows.rolling} now={Date.now()} />
            <MeterRow
              label="Weekly · all models"
              window={data().windows.weekly}
              now={Date.now()}
            />
            <MeterRow label="Monthly" window={data().windows.monthly} now={Date.now()} />
            <div
              style={{
                display: "flex",
                "justify-content": "space-between",
                "align-items": "center",
                gap: "12px",
                "padding-top": "2px",
                "font-size": "11px",
                color: "var(--v2-text-text-faint)",
              }}
            >
              <span>
                {formatUpdated(data().updatedAt, Date.now())}
                {data().stale ? " · stale" : ""}
              </span>
              <button
                type="button"
                onClick={props.onSeeAll}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--v2-text-text-accent)",
                  "font-size": "11px",
                  "font-weight": 530,
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                See all →
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
