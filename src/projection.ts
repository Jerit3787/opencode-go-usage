import { clampPercent, type ConsoleActivity } from "./usage"

export const DAY_MS = 24 * 60 * 60 * 1000
export const WIDTH = 640
export const HEIGHT = 236
export const LEFT = 42
export const RIGHT = 14
export const TOP = 16
export const BOTTOM = 28

export type ProjectionPoint = { day: number; value: number }

/**
 * Builds the projection from Console's daily activity and the server's
 * authoritative monthly meter. Console distributes the meter percentage across
 * daily cost; it does not divide cost by a plan price or dollar pool.
 */
export function buildProjection(
  activity: ConsoleActivity,
  serverPercent: number,
  resetAt: number,
  now: number,
) {
  const start = Date.parse(activity.startsAt)
  const end = resetAt > start ? resetAt : start + 30 * DAY_MS
  const periodDays = Math.max(1, (end - start) / DAY_MS)
  const elapsedDays = Math.max(0, Math.min(periodDays, (now - start) / DAY_MS))
  const percent = clampPercent(serverPercent)
  const totalCost = activity.daily.reduce((total, day) => total + day.cost, 0)
  const forecast =
    elapsedDays >= 1 && percent > 0 ? (percent * periodDays) / elapsedDays : undefined
  const runsOut =
    forecast !== undefined && forecast > 100 && percent > 0
      ? start + ((now - start) * 100) / percent
      : undefined
  const perDay = elapsedDays >= 1 && percent > 0 ? percent / elapsedDays : undefined

  const points: ProjectionPoint[] = [{ day: 0, value: 0 }]
  if (totalCost > 0) {
    let cumulative = 0
    for (const [index, day] of activity.daily.entries()) {
      cumulative += (day.cost / totalCost) * percent
      const at = Date.parse(`${day.date}T00:00:00Z`) + DAY_MS
      points.push({
        day:
          index === activity.daily.length - 1
            ? elapsedDays
            : Math.max(0, Math.min(elapsedDays, (at - start) / DAY_MS)),
        value: cumulative,
      })
    }
  }
  if (points.length === 1) points.push({ day: elapsedDays, value: percent })

  const maximum = Math.max(
    100,
    Math.ceil(Math.max(percent, forecast ?? 0, 1) / 50) * 50,
  )
  const x = (day: number) =>
    LEFT +
    (Math.max(0, Math.min(periodDays, day)) / periodDays) * (WIDTH - LEFT - RIGHT)
  const y = (value: number) =>
    TOP + (1 - Math.max(0, Math.min(maximum, value)) / maximum) * (HEIGHT - TOP - BOTTOM)
  const line = (items: ProjectionPoint[]) =>
    items
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.day)},${y(point.value)}`)
      .join(" ")

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
    runsOutX: runsOut === undefined ? undefined : x((runsOut - start) / DAY_MS),
  }
}
