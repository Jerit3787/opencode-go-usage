import { onMount, Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { MeterRow } from "./meter"
import { InlineNotice, StatusBlock } from "./status"
import type { UsageState } from "./state"
import { dataOf, formatUpdated, noticeFor, statusCopy } from "./usage"

export function UsageCard(props: {
  state: UsageState
  ctx: Context
  onSeeAll(): void
}) {
  const ui = props.ctx.ui

  onMount(() => {
    if (props.state.loading()) return
    const data = dataOf(props.state.result())
    if (!data) void props.state.refresh()
    else if (Date.now() - data.updatedAt > 30_000) void props.state.refresh({ force: true })
  })

  const data = () => dataOf(props.state.result())
  const copy = () => statusCopy(props.state.result())
  const notice = () => noticeFor(props.state.result())

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
    <div style={{ display: "grid", gap: "12px", padding: "4px" }}>
      <Show
        when={data()}
        fallback={
          <StatusBlock
            copy={copy()}
            run={run}
            loading={props.state.initialLoading()}
            ui={ui}
          />
        }
      >
        {(data) => (
          <div style={{ display: "grid", gap: "12px" }}>
            <Show when={notice()}>
              {(notice) => <InlineNotice copy={notice()} run={run} />}
            </Show>
            <MeterRow
              kind="rolling"
              label="5-hour limit"
              window={data().windows.rolling}
              now={Date.now()}
            />
            <MeterRow
              kind="weekly"
              label="Weekly · all models"
              window={data().windows.weekly}
              now={Date.now()}
            />
            <MeterRow
              kind="monthly"
              label="Monthly"
              window={data().windows.monthly}
              now={Date.now()}
            />
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
