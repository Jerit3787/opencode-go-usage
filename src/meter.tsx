import {
  clampPercent,
  formatPercent,
  formatReset,
  usageColor,
  usageTone,
  type UsageWindow,
} from "./usage"

export function MeterRow(props: {
  label: string
  window: UsageWindow
  now: number
  size?: "small" | "large"
}) {
  const tone = usageTone(props.window.percent, props.window.limited)
  const color = usageColor(tone)
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
            {formatReset(props.window.resetsAt, props.now)}
          </span>
          <strong style={{ color, "font-weight": 600 }}>
            {formatPercent(props.window.percent)}
          </strong>
        </span>
      </div>
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
            width: `${clampPercent(props.window.percent)}%`,
            height: "100%",
            background: color,
            "border-radius": "999px",
          }}
        />
      </div>
    </div>
  )
}
