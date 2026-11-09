import { expect, it } from "vitest"
import { buildProjection, DAY_MS } from "./projection"

const start = Date.UTC(2026, 10, 5, 7, 0, 6)
const reset = Date.UTC(2026, 11, 5, 7, 0, 6)
const now = start + 4 * DAY_MS

const activity = {
  startsAt: new Date(start).toISOString(),
  daily: [
    { date: "2026-11-05", cost: 10, requests: 100 },
    { date: "2026-11-06", cost: 30, requests: 200 },
  ],
}

it("uses the server monthly meter instead of dividing Console cost by a pool", () => {
  const projection = buildProjection(activity, 21, reset, now)

  expect(projection.percent).toBe(21)
  expect(projection.points.at(-1)?.value).toBeCloseTo(21)
  expect(projection.points.at(-1)?.day).toBeCloseTo(4)
  expect(projection.forecast).toBeCloseTo(157.5)
  expect(projection.perDay).toBeCloseTo(5.25)
  expect(projection.maximum).toBe(200)
  expect(projection.runsOut).toBeCloseTo(start + (4 * 100 * DAY_MS) / 21)
  expect(projection.runsOutX).toBeDefined()
})

it("distributes the meter across daily Console cost", () => {
  const projection = buildProjection(activity, 20, reset, now)

  expect(projection.points[1].value).toBeCloseTo(5)
  expect(projection.points[1].day).toBeCloseTo((Date.parse("2026-11-06T00:00:00Z") - start) / DAY_MS)
  expect(projection.points[2].value).toBeCloseTo(20)
})

it("does not treat Console dollars as a percentage of a plan pool", () => {
  const projection = buildProjection(
    {
      startsAt: new Date(start).toISOString(),
      daily: [{ date: "2026-11-05", cost: 100, requests: 1 }],
    },
    4,
    reset,
    now,
  )

  expect(projection.percent).toBe(4)
  expect(projection.forecast).toBeCloseTo(30)
  expect(projection.points.at(-1)?.value).toBeCloseTo(4)
  expect(projection.runsOut).toBeUndefined()
})
