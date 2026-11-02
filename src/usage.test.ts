import { expect, it } from "vitest"
import {
  actionLabel,
  cacheKey,
  cacheTtl,
  clampPercent,
  dataOf,
  formatPercent,
  formatReset,
  formatUpdated,
  noticeFor,
  parseUsageResponse,
  pillView,
  statusCopy,
  tightestWindow,
  usageTone,
  withStaleData,
} from "./usage"

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0)

const body = {
  usage: {
    rolling: { status: "ok", percent: 27, resetsAt: "2026-11-02T18:40:00.000Z" },
    weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
    monthly: { status: "ok", percent: 78, resetsAt: "2026-11-22T04:08:19.000Z" },
  },
}

it("parses the live response shape", () => {
  const data = parseUsageResponse(body, NOW)
  expect(data).not.toBeNull()
  expect(data!.windows.rolling).toEqual({
    percent: 27,
    limited: false,
    resetsAt: Date.UTC(2026, 10, 2, 18, 40),
  })
  expect(data!.windows.weekly.percent).toBe(10)
  expect(data!.windows.monthly.percent).toBe(78)
  expect(data!.updatedAt).toBe(NOW)
  expect(data!.stale).toBe(false)
})

it("rejects a response missing a window or a numeric percent", () => {
  expect(
    parseUsageResponse({ usage: { rolling: body.usage.rolling, weekly: body.usage.weekly } }, NOW),
  ).toBeNull()
  expect(
    parseUsageResponse({ usage: { ...body.usage, monthly: { percent: "78" } } }, NOW),
  ).toBeNull()
})

it("clamps percentages and treats non-ok status as limited", () => {
  expect(clampPercent(120)).toBe(100)
  expect(clampPercent(-5)).toBe(0)
  const data = parseUsageResponse(
    {
      usage: {
        ...body.usage,
        rolling: { status: "limited", percent: 100, resetsAt: body.usage.rolling.resetsAt },
      },
    },
    NOW,
  )!
  expect(data.windows.rolling.limited).toBe(true)
})

it("picks the tightest window and keeps rolling on a tie", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(tightestWindow(data).key).toBe("monthly")
  const tie = parseUsageResponse(
    {
      usage: {
        rolling: { status: "ok", percent: 50, resetsAt: body.usage.rolling.resetsAt },
        weekly: { status: "ok", percent: 50, resetsAt: body.usage.weekly.resetsAt },
        monthly: { status: "ok", percent: 10, resetsAt: body.usage.monthly.resetsAt },
      },
    },
    NOW,
  )!
  expect(tightestWindow(tie).key).toBe("rolling")
})

it("maps tones at the exact thresholds", () => {
  expect(usageTone(69, false)).toBe("none")
  expect(usageTone(70, false)).toBe("warning")
  expect(usageTone(89, false)).toBe("warning")
  expect(usageTone(90, false)).toBe("danger")
  expect(usageTone(10, true)).toBe("danger")
})

it("formats reset times and updated times in UTC", () => {
  expect(formatReset(Date.UTC(2026, 10, 2, 18, 40), NOW, { timeZone: "UTC" })).toBe(
    "Resets at 6:40 PM",
  )
  expect(formatReset(Date.UTC(2026, 10, 8, 18, 0), NOW, { timeZone: "UTC" })).toBe(
    "Resets Sun 6:00 PM",
  )
  expect(formatReset(Date.UTC(2026, 10, 22, 4, 8), NOW, { timeZone: "UTC" })).toBe(
    "Resets 22 Nov 4:08 AM",
  )
  expect(formatReset(0, NOW, { timeZone: "UTC" })).toBe("Reset time unavailable")
  expect(formatUpdated(NOW - 30_000, NOW, { timeZone: "UTC" })).toBe("Updated just now")
  expect(formatUpdated(NOW - 5 * 60_000, NOW, { timeZone: "UTC" })).toBe("Updated 5m ago")
  expect(formatUpdated(NOW - 2 * 60 * 60_000, NOW, { timeZone: "UTC" })).toBe(
    "Updated 10:00 AM",
  )
})

it("builds the pill label and keeps data on errors", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(pillView({ state: "ok", data })).toEqual({ label: "mo 78%", tone: "warning" })
  const low = parseUsageResponse(
    {
      usage: {
        ...body.usage,
        monthly: { status: "ok", percent: 20, resetsAt: body.usage.monthly.resetsAt },
      },
    },
    NOW,
  )!
  expect(pillView({ state: "ok", data: low })).toEqual({ label: "5h 27%", tone: undefined })
  expect(pillView({ state: "rejected", message: "no" })).toEqual({
    label: "Go usage",
    tone: "danger",
  })
  expect(pillView({ state: "error", message: "no" })).toEqual({
    label: "Go usage",
    tone: "warning",
  })
  const stale = withStaleData({ state: "error", message: "offline" }, data)
  expect(dataOf(stale)?.stale).toBe(true)
  expect(dataOf(stale)?.error).toBe("offline")
  expect(dataOf({ state: "signed-out" })).toBeUndefined()
})

it("maps status copy and cache values", () => {
  expect(statusCopy({ state: "signed-out" }).action).toBe("connect")
  expect(statusCopy({ state: "console-only" }).action).toBe("usage")
  expect(statusCopy({ state: "no-plan", message: "no" }).action).toBe("console")
  expect(statusCopy({ state: "unavailable", message: "no" }).action).toBe("retry")
  expect(statusCopy({ state: "error", message: "no" }).action).toBe("retry")
  expect(statusCopy({ state: "rejected", message: "no" }).action).toBe("connect")
  expect(cacheKey(undefined, "cred_1")).toBe("sidecar:cred_1")
  expect(cacheKey("remote", "cred_1")).toBe("remote:cred_1")
  expect(cacheTtl({ state: "ok", data: parseUsageResponse(body, NOW)! })).toBe(60_000)
  expect(cacheTtl({ state: "error", message: "no" })).toBe(45_000)
  expect(formatPercent(27.6)).toBe("28%")
})

it("maps state actions and notices, including stale data", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(actionLabel("connect")).toBe("Connect OpenCode Go")
  expect(actionLabel("usage")).toBe("Open built-in Usage")
  expect(actionLabel("console")).toBe("Open Console")
  expect(actionLabel("retry")).toBe("Retry")
  expect(actionLabel("none")).toBe("")
  expect(noticeFor({ state: "ok", data })).toBeUndefined()
  expect(noticeFor({ state: "error", message: "no", data })?.title).toBe(
    "Usage couldn't be loaded",
  )
  expect(noticeFor({ state: "signed-out" })?.action).toBe("connect")
  expect(noticeFor({ state: "console-only" })?.action).toBe("usage")
  expect(noticeFor({ state: "no-plan", message: "no", data })?.action).toBe("console")
  expect(noticeFor({ state: "unavailable", message: "no", data })?.action).toBe("retry")
  expect(pillView({ state: "console-only" })).toEqual({ label: "Go usage", tone: undefined })
  expect(pillView({ state: "no-plan", message: "no" })).toEqual({
    label: "Go usage",
    tone: undefined,
  })
  expect(pillView({ state: "unavailable", message: "no" })).toEqual({
    label: "Go usage",
    tone: "warning",
  })
  const stale = withStaleData({ state: "error", message: "offline" }, data)
  expect(pillView(stale)).toEqual({ label: "mo 78%", tone: "warning" })
})
