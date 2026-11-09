import type { Context } from "@opencode/plugin/gui"
import { cardStyle, rowStyle } from "./layout"
import { GO_PRICING_URL } from "./usage"

const ROWS = [
  {
    label: "Monthly",
    body: "Each model's Console cost ÷ that model's monthly limit. Each model has its own limit; there is no shared dollar pool. The first calendar day is prorated from the exact Go period start.",
  },
  {
    label: "5-hour",
    body: "20% of the monthly limit. The window starts at the first request after reset.",
  },
  {
    label: "Weekly",
    body: "50% of the monthly limit. The window is the UTC calendar week.",
  },
  {
    label: "Peak pricing",
    body: "2× on weekdays 01:00–04:00 and 06:00–10:00 UTC. The Console Activity table does not split it out.",
  },
  {
    label: "Server meter",
    body: "Authoritative and shown as a whole percentage. The model calculation prorates the first calendar day from the exact Go period start, so remaining differences should be within meter rounding.",
  },
  {
    label: "Plan",
    body: "Go, Go Plus, or Go Teams is detected from the latest Console billing invoice. Each plan has different per-model limits.",
  },
  {
    label: "Source",
    body: "Console activity for the current Go monthly period, or the last 30 days when the reset is unknown. If the active server is remote and has no Console sign-in, the desktop's Console account is used. Otherwise the card falls back to local session stats.",
  },
]

export function UsageInfo(props: { ctx: Context }) {
  return (
    <div style={cardStyle}>
      <div style={{ padding: "16px 16px 10px", display: "grid", gap: "3px" }}>
        <div
          style={{
            "font-size": "15px",
            "font-weight": 600,
            color: "var(--v2-text-text-base)",
          }}
        >
          How this is calculated
        </div>
        <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)" }}>
          Method and data sources
        </div>
      </div>

      {ROWS.map((row) => (
        <div
          style={{
            ...rowStyle,
            display: "grid",
            "grid-template-columns": "92px minmax(0, 1fr)",
            gap: "12px",
            "align-items": "baseline",
          }}
        >
          <span
            style={{
              "font-size": "12px",
              "font-weight": 530,
              color: "var(--v2-text-text-base)",
            }}
          >
            {row.label}
          </span>
          <span
            style={{
              "font-size": "12px",
              "line-height": "1.45",
              color: "var(--v2-text-text-muted)",
            }}
          >
            {row.body}
          </span>
        </div>
      ))}

      <div style={{ padding: "12px 16px 14px" }}>
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
