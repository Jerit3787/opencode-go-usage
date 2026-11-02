export const WINDOW_KEYS = ["rolling", "weekly", "monthly"] as const

export type WindowKey = (typeof WINDOW_KEYS)[number]

export type UsageWindow = {
  percent: number
  limited: boolean
  resetsAt: number
}

export type UsageData = {
  windows: Record<WindowKey, UsageWindow>
  updatedAt: number
  stale: boolean
  error?: string
}

export type UsageResult =
  | { state: "ok"; data: UsageData }
  | { state: "signed-out" }
  | { state: "console-only" }
  | { state: "unavailable"; message: string; data?: UsageData }
  | { state: "rejected"; message: string }
  | { state: "no-plan"; message: string; data?: UsageData }
  | { state: "error"; message: string; data?: UsageData }

export type StatusCopy = {
  title: string
  body: string
  action: "connect" | "console" | "usage" | "retry" | "none"
}

export type FormatOptions = {
  locale?: string
  timeZone?: string
}

const DEFAULT_LOCALE = "en-US"
const DAY_MS = 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function parseUsageResponse(body: unknown, now: number): UsageData | null {
  if (!isRecord(body)) return null
  const usage = body.usage
  if (!isRecord(usage)) return null

  const windows = {} as Record<WindowKey, UsageWindow>
  for (const key of WINDOW_KEYS) {
    const value = usage[key]
    if (!isRecord(value)) return null
    if (typeof value.percent !== "number" || !Number.isFinite(value.percent)) return null

    const status = typeof value.status === "string" ? value.status : undefined
    windows[key] = {
      percent: clampPercent(value.percent),
      limited: value.limited === true || (status !== undefined && status !== "ok"),
      resetsAt: parseTimestamp(value.resetsAt),
    }
  }

  return { windows, updatedAt: now, stale: false }
}

export function tightestWindow(data: UsageData): { key: WindowKey; window: UsageWindow } {
  let bestKey: WindowKey = "rolling"
  let best = data.windows[bestKey]

  for (const key of WINDOW_KEYS) {
    const candidate = data.windows[key]
    if (candidate.percent > best.percent) {
      bestKey = key
      best = candidate
    }
  }

  return { key: bestKey, window: best }
}

export function windowShortLabel(key: WindowKey): "5h" | "wk" | "mo" {
  switch (key) {
    case "rolling":
      return "5h"
    case "weekly":
      return "wk"
    case "monthly":
      return "mo"
  }
}

export function usageTone(percent: number, limited: boolean): "none" | "warning" | "danger" {
  if (limited || percent >= 90) return "danger"
  if (percent >= 70) return "warning"
  return "none"
}

export function usageColor(tone: "none" | "warning" | "danger"): string {
  switch (tone) {
    case "none":
      return "var(--v2-text-text-accent)"
    case "warning":
      return "var(--v2-state-fg-warning)"
    case "danger":
      return "var(--v2-state-fg-danger)"
  }
}

export function formatPercent(percent: number): string {
  return `${Math.round(clampPercent(percent))}%`
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? ""
}

function timeLabel(ms: number, options: FormatOptions): string {
  const parts = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: options.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(new Date(ms))
  return `${part(parts, "hour")}:${part(parts, "minute")} ${part(parts, "dayPeriod")}`.trim()
}

function dayKey(ms: number, options: FormatOptions): string {
  const parts = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: options.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms))
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`
}

export function formatReset(resetsAt: number, now: number, options: FormatOptions = {}): string {
  if (!Number.isFinite(resetsAt) || resetsAt <= 0) return "Reset time unavailable"

  if (dayKey(resetsAt, options) === dayKey(now, options)) {
    return `Resets at ${timeLabel(resetsAt, options)}`
  }

  const delta = resetsAt - now
  if (delta >= 0 && delta < 7 * DAY_MS) {
    const weekday = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
      timeZone: options.timeZone,
      weekday: "short",
    }).format(new Date(resetsAt))
    return `Resets ${weekday} ${timeLabel(resetsAt, options)}`
  }

  const parts = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: options.timeZone,
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(resetsAt))
  return `Resets ${part(parts, "day")} ${part(parts, "month")} ${timeLabel(resetsAt, options)}`
}

export function formatUpdated(updatedAt: number, now: number, options: FormatOptions = {}): string {
  const delta = now - updatedAt
  if (delta < 60_000) return "Updated just now"
  if (delta < 60 * 60_000) return `Updated ${Math.floor(delta / 60_000)}m ago`
  return `Updated ${timeLabel(updatedAt, options)}`
}

export function dataOf(result: UsageResult | undefined): UsageData | undefined {
  if (!result) return undefined
  switch (result.state) {
    case "ok":
      return result.data
    case "error":
    case "unavailable":
    case "no-plan":
      return result.data
    default:
      return undefined
  }
}

export function pillView(
  result: UsageResult | undefined,
): { label: string; tone?: "warning" | "danger" } {
  const data = dataOf(result)
  if (data) {
    const { key, window } = tightestWindow(data)
    const tone = usageTone(window.percent, window.limited)
    return {
      label: `${windowShortLabel(key)} ${formatPercent(window.percent)}`,
      tone: tone === "none" ? undefined : tone,
    }
  }

  return {
    label: "Go usage",
    tone:
      result?.state === "rejected"
        ? "danger"
        : result?.state === "error" || result?.state === "unavailable"
          ? "warning"
          : undefined,
  }
}

export function withStaleData(
  result: UsageResult,
  lastGood: UsageData | undefined,
): UsageResult {
  if (!lastGood) return result

  switch (result.state) {
    case "error":
    case "unavailable":
    case "no-plan":
      return { ...result, data: { ...lastGood, stale: true, error: result.message } }
    default:
      return result
  }
}

export function cacheKey(server: string | undefined, credentialID: string): string {
  return `${server ?? "sidecar"}:${credentialID}`
}

export function cacheTtl(result: UsageResult): number {
  return result.state === "ok" ? 60_000 : 45_000
}

export function statusCopy(result: UsageResult | undefined): StatusCopy {
  if (!result) {
    return {
      title: "Usage unavailable",
      body: "OpenCode Go usage is not available yet.",
      action: "retry",
    }
  }

  switch (result.state) {
    case "signed-out":
      return {
        title: "OpenCode Go isn't connected",
        body: "Connect OpenCode Go with an API key to see your usage.",
        action: "connect",
      }
    case "console-only":
      return {
        title: "Connected through Console",
        body: "Open the built-in Usage page to see Console budgets and Go usage.",
        action: "usage",
      }
    case "rejected":
      return {
        title: "OpenCode Go rejected the stored key",
        body: "Reconnect OpenCode Go to keep tracking usage.",
        action: "connect",
      }
    case "no-plan":
      return {
        title: "No OpenCode Go allowance",
        body: "This key is valid, but it has no Go plan. Check your plan in Console.",
        action: "console",
      }
    case "unavailable":
      return {
        title: "Couldn't check your OpenCode connection",
        body: "The OpenCode server isn't reachable. Retry in a moment.",
        action: "retry",
      }
    case "error":
      return {
        title: "Usage couldn't be loaded",
        body: "OpenCode returned an error. Retry, or check Console.",
        action: "retry",
      }
    case "ok":
      return { title: "", body: "", action: "none" }
  }
}
