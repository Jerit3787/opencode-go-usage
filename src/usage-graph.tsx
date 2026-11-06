import { For, Show } from "solid-js"
import { cardStyle, rowStyle } from "./layout"
import type { UsageState } from "./state"
import {
  dataOf,
  formatPercent1,
  GO_PLAN_POOLS,
  goPlanName,
  type ConsoleActivity,
} from "./usage"

const DAY_MS = 24 * 60 * 60 * 1000
const WIDTH = 640
const HEIGHT = 236
const LEFT = 42
const RIGHT = 14
const TOP = 16
const BOTTOM = 28

function dateLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms))
}

type Point = { day: number; value: number }

function graphData(activity: ConsoleActivity, pool: number, resetAt: number, now: number) {
  const start = Date.parse(activity.startsAt)
  const end = resetAt > start ? resetAt : start + 30 * DAY_MS
  const periodDays = Math.max(1, (end - start) / DAY_MS)
  const elapsedDays = Math.max(0, Math.min(periodDays, (now - start) / DAY_MS))
  const totalCost = activity.daily.reduce((total, day) => total + day.cost, 0)
  const percent = pool > 0 ? (totalCost / pool) * 100 : 0
  const forecast =
    elapsedDays >= 1 && percent > 0 ? (percent * periodDays) / elapsedDays : undefined
  const runsOut =
    forecast !== undefined && forecast > 100 && percent > 0
      ? start + ((now - start) * 100) / percent
      : undefined
  const perDay = elapsedDays >= 1 && percent > 0 ? percent / elapsedDays : undefined

  const points: Point[] = [{ day: 0, value: 0 }]
  if (totalCost > 0) {
    let cumulative = 0
    for (const day of activity.daily) {
      cumulative += (day.cost / totalCost) * percent
      const at = Date.parse(`${day.date}T00:00:00Z`) + DAY_MS
      points.push({
        day: Math.max(0, Math.min(periodDays, (at - start) / DAY_MS)),
        value: cumulative,
      })
    }
  }
  if (points.length === 1) points.push({ day: elapsedDays, value: percent })

  const maximum = Math.max(
    100,
    Math.ceil(Math.max(percent, forecast ?? 0, 1) / 50) * 50,
  )
  const x = (day: number) => LEFT + (Math.max(0, Math.min(periodDays, day)) / periodDays) * (WIDTH - LEFT - RIGHT)
  const y = (value: number) => TOP + (1 - Math.max(0, Math.min(maximum, value)) / maximum) * (HEIGHT - TOP - BOTTOM)
  const line = (items: Point[]) =>
    items.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.day)},${y(point.value)}`).join(" ")

  return {
    start,
    end,
    periodDays,
    elapsedDays,
    percent,
    forecast,
    runsOut,
    perDay,
    points,
    maximum,
    x,
    y,
    usagePath: line(points),
    areaPath: `${line(points)} L${x(points.at(-1)!.day)},${y(0)} L${x(0)},${y(0)} Z`,
    forecastPath:
      forecast === undefined
        ? undefined
        : line([
            { day: elapsedDays, value: percent },
            { day: periodDays, value: forecast },
          ]),
    currentX: x(elapsedDays),
    currentY: y(percent),
    forecastX: x(periodDays),
    forecastY: forecast === undefined ? undefined : y(forecast),
  }
}

export function UsageGraph(props: { state: UsageState }) {
  const data = () => {
    const result = props.state.consoleModels()
    return result?.state === "ok" ? result.data : undefined
  }
  const activity = () => data()?.activity
  const plan = () => data()?.plan ?? props.state.plan()
  const reset = () =>
    dataOf(props.state.result())?.windows.monthly.resetsAt ??
    (activity() ? Date.parse(activity()!.startsAt) + 30 * DAY_MS : Date.now())
  const graph = () =>
    activity() ? graphData(activity()!, GO_PLAN_POOLS[plan()], reset(), Date.now()) : undefined

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "flex-start",
          gap: "16px",
          padding: "16px 16px 8px",
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
            Usage projection
          </div>
          <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)" }}>
            {goPlanName(plan())} · current Go month
          </div>
        </div>
        <Show
          when={graph()}
          fallback={
            <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
              Projection unavailable
            </span>
          }
        >
          {(current) => (
            <div style={{ display: "grid", gap: "2px", "text-align": "right" }}>
              <span
                style={{
                  "font-size": "20px",
                  "font-weight": 640,
                  color: "var(--v2-text-text-base)",
                  "font-variant-numeric": "tabular-nums",
                }}
              >
                {formatPercent1(current().percent)}
              </span>
              <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
                of monthly allowance
              </span>
            </div>
          )}
        </Show>
      </div>

      <Show
        when={graph()}
        fallback={
          <div
            style={{
              ...rowStyle,
              "font-size": "12px",
              color: "var(--v2-text-text-muted)",
            }}
          >
            Console activity isn't available, so there is no projection to draw.
          </div>
        }
      >
        {(current) => (
          <>
            <div
              style={{
                display: "flex",
                gap: "12px",
                "flex-wrap": "wrap",
                padding: "0 16px 10px",
                "font-size": "11px",
                color: "var(--v2-text-text-muted)",
              }}
            >
              <span>Renews {dateLabel(current().end)}</span>
              <Show when={current().runsOut}>
                <span style={{ color: "var(--v2-state-fg-warning)" }}>
                  On pace to hit the limit {dateLabel(current().runsOut!)}
                </span>
              </Show>
              <Show when={!current().runsOut && current().forecast !== undefined}>
                <span>On pace for {formatPercent1(current().forecast!)}</span>
              </Show>
            </div>

            <div style={{ padding: "0 8px" }}>
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                width="100%"
                role="img"
                aria-label={`${goPlanName(plan())} monthly usage and forecast`}
                style={{ display: "block", overflow: "visible" }}
              >
                <defs>
                  <linearGradient id="oc-go-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="var(--v2-text-text-accent)" stop-opacity="0.14" />
                    <stop offset="1" stop-color="var(--v2-text-text-accent)" stop-opacity="0" />
                  </linearGradient>
                </defs>

                <For each={[0, current().maximum / 2, current().maximum]}>
                  {(tick) => (
                    <g>
                      <line
                        x1={LEFT}
                        x2={WIDTH - RIGHT}
                        y1={current().y(tick)}
                        y2={current().y(tick)}
                        stroke="var(--v2-border-border-muted)"
                        stroke-width="1"
                      />
                      <text
                        x={LEFT - 6}
                        y={current().y(tick) + 3}
                        text-anchor="end"
                        font-size="9"
                        fill="var(--v2-text-text-faint)"
                      >
                        {Math.round(tick)}%
                      </text>
                    </g>
                  )}
                </For>

                <line
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={current().y(100)}
                  y2={current().y(100)}
                  stroke="var(--v2-text-text-faint)"
                  stroke-width="1"
                  stroke-dasharray="4 4"
                />
                <text
                  x={WIDTH - RIGHT}
                  y={current().y(100) - 4}
                  text-anchor="end"
                  font-size="9"
                  fill="var(--v2-text-text-faint)"
                >
                  Monthly limit 100%
                </text>

                <path d={current().areaPath} fill="url(#oc-go-area)" />
                <path
                  d={current().usagePath}
                  fill="none"
                  stroke="var(--v2-text-text-accent)"
                  stroke-width="2"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <Show when={current().forecastPath}>
                  <path
                    d={current().forecastPath!}
                    fill="none"
                    stroke="var(--v2-state-fg-warning)"
                    stroke-width="1.5"
                    stroke-dasharray="4 4"
                  />
                </Show>

                <circle
                  cx={current().currentX}
                  cy={current().currentY}
                  r="3.5"
                  fill="var(--v2-text-text-accent)"
                  stroke="var(--v2-background-bg-base)"
                  stroke-width="1.5"
                />
                <Show when={current().forecastY !== undefined}>
                  <circle
                    cx={current().forecastX}
                    cy={current().forecastY!}
                    r="3"
                    fill="var(--v2-state-fg-warning)"
                  />
                  <text
                    x={current().forecastX - 4}
                    y={current().forecastY! - 8}
                    text-anchor="end"
                    font-size="9"
                    fill="var(--v2-state-fg-warning)"
                  >
                    {formatPercent1(current().forecast!)}
                  </text>
                </Show>

                <For each={[current().start, current().start + (current().end - current().start) / 2, current().end]}>
                  {(date) => (
                    <text
                      x={current().x(((date - current().start) / DAY_MS))}
                      y={HEIGHT - 6}
                      text-anchor={
                        date === current().start ? "start" : date === current().end ? "end" : "middle"
                      }
                      font-size="9"
                      fill="var(--v2-text-text-faint)"
                    >
                      {dateLabel(date)}
                    </text>
                  )}
                </For>
              </svg>
            </div>

            <div
              style={{
                ...rowStyle,
                display: "flex",
                "justify-content": "space-between",
                "align-items": "center",
                gap: "12px",
                "flex-wrap": "wrap",
                "font-size": "11px",
                color: "var(--v2-text-text-faint)",
              }}
            >
              <span>
                <Show
                  when={current().perDay !== undefined}
                  fallback={<>Not enough elapsed time for a daily average</>}
                >
                  Averaging {formatPercent1(current().perDay!)} a day
                </Show>
              </span>
              <span style={{ display: "flex", gap: "10px", "flex-wrap": "wrap" }}>
                <span style={{ color: "var(--v2-text-text-accent)" }}>Usage</span>
                <span style={{ color: "var(--v2-state-fg-warning)" }}>Forecast</span>
                <span>Monthly limit</span>
              </span>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
