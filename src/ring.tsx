import { createMemo } from "solid-js"
import { ringOffset } from "./usage"

export function Ring(props: {
  percent: number
  size: number
  stroke: number
  color: string
  label: string
}) {
  const radius = (props.size - props.stroke) / 2
  const center = props.size / 2
  const circumference = 2 * Math.PI * radius
  const offset = createMemo(() => ringOffset(props.percent, props.size, props.stroke))

  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox={`0 0 ${props.size} ${props.size}`}
      role="img"
      aria-label={props.label}
      style={{ flex: "none" }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--v2-border-border-muted)"
        stroke-width={props.stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={props.color}
        stroke-width={props.stroke}
        stroke-linecap="round"
        stroke-dasharray={`${circumference} ${circumference}`}
        stroke-dashoffset={offset()}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text
        x="50%"
        y="50%"
        text-anchor="middle"
        dominant-baseline="central"
        fill="var(--v2-text-text-base)"
        font-size={props.size >= 48 ? "15" : "11"}
        font-weight="600"
      >
        {props.label}
      </text>
    </svg>
  )
}
