import { createMemo, Show } from "solid-js"
import {
  clampPercent,
  formatPercent,
  formatReset,
  usageColor,
  usageTone,
  type UsageWindow,
  type WindowKey,
} from "./usage"

export function MeterRow(props: {
  label: string
  kind: WindowKey
  window: UsageWindow
  now: number
  size?: "small" | "large"
}) {
  const tone = createMemo(() => usageTone(props.window.percent, props.window.limited))
  const color = createMemo(() => usageColor(tone()))
  const width = createMemo(() => `${clampPercent(props.window.percent)}%`)
  const height = props.size === "large" ? "6px" : "4px"

  return (
    <div style={{ display: "grid", gap: "6px" }}>
      <div
        style={{
          display: "flex",
          "align-items": "baseline",
          "justify-content": "space-between",
          gap: "12px",
          "font-size": props.size === "large" ? "13px" : "12px",
          "line-height": "1.3",
        }}
      >
        <span style={{ color: "var(--v2-text-text-base)", "font-weight": 500 }}>{props.label}</span>
        <span
          style={{
            display: "inline-flex",
            gap: "8px",
            "align-items": "baseline",
            "white-space": "nowrap",
          }}
        >
          <span style={{ color: "var(--v2-text-text-muted)" }}>
            {formatReset(props.window.resetsAt, props.now, { kind: props.kind })}
          </span>
          <strong style={{ color: color(), "font-weight": 600 }}>
            {formatPercent(props.window.percent)}
          </strong>
        </span>
      </div>
      <Show when={props.window.limited}>
        <div
          style={{
            color: "var(--v2-state-fg-danger)",
            "font-size": "11px",
            "font-weight": 530,
          }}
        >
          Limit reached
        </div>
      </Show>
      <div
        style={{
          height,
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
    </div>
  )
}
