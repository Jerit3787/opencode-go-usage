export const WINDOW_KEYS = ["rolling", "weekly", "monthly"] as const

export type WindowKey = (typeof WINDOW_KEYS)[number]

export type UsageWindow = {
  percent: number
  limited: boolean
  resetsAt: number
}

export type ConsoleWorkspace = {
  id: string
  name?: string
  usageURL: string
}

export type UsageData = {
  windows: Record<WindowKey, UsageWindow>
  updatedAt: number
  stale: boolean
  error?: string
  workspace?: ConsoleWorkspace
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

export type ModelUsage = {
  providerID: string
  modelID: string
  name: string
  monthlyCost: number
  weeklyCost: number
  rollingCost: number
  monthlyTokens: number
}

export type ModelAnalytics = {
  models: readonly ModelUsage[]
  monthlyFrom: number
  monthlyTo: number
  weeklyFrom: number
  rollingFrom: number
  totalMonthlyCost: number
  serverMonthlyPercent: number
}

export type ModelAnalyticsResult =
  | { state: "ok"; data: ModelAnalytics }
  | { state: "error"; message: string }

export type ConsoleModelUsage = {
  providerID: string
  modelID: string
  name: string
  cost: number
  requests: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWrite5mTokens: number
  cacheWrite1hTokens: number
}

export type ConsoleModelAnalytics = {
  models: readonly ConsoleModelUsage[]
  range: "30d"
  totalCost: number
}

export type ConsoleModelResult =
  | { state: "ok"; data: ConsoleModelAnalytics }
  | { state: "error"; message: string }

// Monthly allowances from the Go plan table:
// https://opencode.ai/v2/docs/console/go#usage-limits
// Pulled 2026-11-02.
export const GO_PRICING_URL = "https://opencode.ai/v2/docs/console/go#usage-limits"

export const GO_MONTHLY_ALLOWANCES: Record<string, number> = {
  "glm-5.3-flash": 60,
  "glm-5.3": 15,
  "glm-5.2": 60,
  "kimi-k3.1-pro": 15,
  "kimi-k3": 15,
  "kimi-k2.7-code": 60,
  "longcat-2.0": 60,
  "step-5-preview": 15,
  "mimo-v2.6-flash": 60,
  "mimo-v2.6-pro": 15,
  "mimo-v2.5": 60,
  "mimo-v2.5-pro": 15,
  "minimax-m3.1-flash": 20,
  "minimax-m3": 60,
  "muse-spark-1.3-contributor": 60,
  "muse-spark-1.2-contributor": 60,
  "qwen3.8-max": 15,
  "qwen3.8-flash": 30,
  "qwen3.7-plus": 60,
  "deepseek-v4.1-flash": 100,
  "deepseek-v4-pro": 15,
  "hy4-preview": 30,
  "hy3": 60,
  "grok-4.7": 15,
  "gpt-6-luna": 15,
  "gpt-5.6-luna": 15,
  "claude-haiku-5-5": 15,
  "gemini-4-argon": 30,
}

const GO_MODEL_NAMES: Record<string, string> = {
  "glm-5.3-flash": "GLM 5.3 Flash",
  "glm-5.3": "GLM 5.3",
  "glm-5.2": "GLM 5.2",
  "kimi-k3.1-pro": "Kimi K3.1 Pro",
  "kimi-k3": "Kimi K3",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "longcat-2.0": "LongCat 2.0",
  "step-5-preview": "Step 5 Preview",
  "mimo-v2.6-flash": "MiMo V2.6 Flash",
  "mimo-v2.6-pro": "MiMo V2.6 Pro",
  "mimo-v2.5": "MiMo V2.5",
  "mimo-v2.5-pro": "MiMo V2.5 Pro",
  "minimax-m3.1-flash": "MiniMax M3.1 Flash",
  "minimax-m3": "MiniMax M3",
  "muse-spark-1.3-contributor": "Muse Spark 1.3 Contributor",
  "muse-spark-1.2-contributor": "Muse Spark 1.2 Contributor",
  "qwen3.8-max": "Qwen3.8 Max",
  "qwen3.8-flash": "Qwen3.8 Flash",
  "qwen3.7-plus": "Qwen3.7 Plus",
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "hy4-preview": "Hy4 Preview",
  "hy3": "Hy3",
  "grok-4.7": "Grok 4.7",
  "gpt-6-luna": "GPT 6 Luna",
  "gpt-5.6-luna": "GPT 5.6 Luna",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "gemini-4-argon": "Gemini 4 Argon",
}

export type StatsModel = {
  providerID: string
  modelID: string
  cost: number
  tokens: number
}

export type FormatOptions = {
  locale?: string
  timeZone?: string
  kind?: WindowKey
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

export function parseUsageLimits(body: unknown, now: number): UsageData | null {
  if (!isRecord(body) || !isRecord(body.data)) return null
  const data = body.data
  if (!isRecord(data.go)) return null

  const windows = {} as Record<WindowKey, UsageWindow>
  for (const key of WINDOW_KEYS) {
    const meter = data.go[key]
    if (!isRecord(meter)) return null
    if (typeof meter.percent !== "number" || !Number.isFinite(meter.percent)) return null
    windows[key] = {
      percent: clampPercent(meter.percent),
      limited: meter.limited === true,
      resetsAt:
        typeof meter.resetsAt === "number" && Number.isFinite(meter.resetsAt)
          ? meter.resetsAt
          : 0,
    }
  }

  let workspace: ConsoleWorkspace | undefined
  if (
    isRecord(data.workspace) &&
    typeof data.workspace.usageURL === "string"
  ) {
    workspace = {
      id: typeof data.workspace.id === "string" ? data.workspace.id : "",
      name:
        typeof data.workspace.name === "string" ? data.workspace.name : undefined,
      usageURL: data.workspace.usageURL,
    }
  }

  return { windows, updatedAt: now, stale: false, workspace }
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

  if (options.kind === "weekly") {
    const weekday = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
      timeZone: options.timeZone,
      weekday: "short",
    }).format(new Date(resetsAt))
    return `Resets ${weekday} ${timeLabel(resetsAt, options)}`
  }

  if (options.kind === "monthly") {
    const parts = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
      timeZone: options.timeZone,
      day: "numeric",
      month: "short",
    }).formatToParts(new Date(resetsAt))
    return `Resets ${part(parts, "day")} ${part(parts, "month")} ${timeLabel(resetsAt, options)}`
  }

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
): { label: string; tone?: "warning" | "danger"; stale: boolean } {
  const data = dataOf(result)
  if (data) {
    const { key, window } = tightestWindow(data)
    const tone = usageTone(window.percent, window.limited)
    return {
      label: `${windowShortLabel(key)} ${formatPercent(window.percent)}`,
      tone: tone === "none" ? undefined : tone,
      stale: data.stale,
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
    stale: false,
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

export function cacheTtl(_result: UsageResult): number {
  return 45_000
}

export function pruneOldest<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) return
    map.delete(oldest)
  }
}

export function ringOffset(percent: number, size: number, stroke: number): number {
  const radius = (size - stroke) / 2
  return 2 * Math.PI * radius * (1 - clampPercent(percent) / 100)
}

export function modelDisplayName(modelID: string): string {
  const known = GO_MODEL_NAMES[modelID]
  if (known) return known
  return modelID
    .split("-")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function modelAllowance(
  modelID: string,
  overrides?: Record<string, number>,
): number | undefined {
  const override = overrides?.[modelID]
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override
  }
  return GO_MONTHLY_ALLOWANCES[modelID]
}

function countTokens(tokens: Record<string, unknown>): number {
  const number = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0
  const cache = isRecord(tokens.cache) ? tokens.cache : {}
  return (
    number(tokens.input) +
    number(tokens.output) +
    number(tokens.reasoning) +
    number(cache.read) +
    number(cache.write)
  )
}

function microCents(value: unknown): number {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : 0
  if (!Number.isFinite(amount)) return 0
  return amount / 100_000_000
}

function tokenCount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function parseConsoleModels(body: unknown): ConsoleModelUsage[] {
  if (!isRecord(body) || !Array.isArray(body.items)) return []

  const models: ConsoleModelUsage[] = []
  for (const entry of body.items) {
    if (!isRecord(entry)) continue
    const providerID = entry.provider
    const modelID = entry.model
    if (providerID !== "opencode-go" || typeof modelID !== "string") continue

    const inputTokens = tokenCount(entry.totalInputTokens)
    const outputTokens = tokenCount(entry.totalOutputTokens)
    const cacheReadTokens = tokenCount(entry.totalCacheReadTokens)
    const cacheWrite5mTokens = tokenCount(entry.totalCacheWrite5mTokens)
    const cacheWrite1hTokens = tokenCount(entry.totalCacheWrite1hTokens)
    models.push({
      providerID,
      modelID,
      name: modelDisplayName(modelID),
      cost: microCents(entry.totalCostMicroCents),
      requests: tokenCount(entry.totalRequests),
      tokens:
        inputTokens +
        outputTokens +
        cacheReadTokens +
        cacheWrite5mTokens +
        cacheWrite1hTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWrite5mTokens,
      cacheWrite1hTokens,
    })
  }

  return models.sort(
    (left, right) => right.cost - left.cost || left.name.localeCompare(right.name),
  )
}

export function parseStatsModels(body: unknown): StatsModel[] {
  const root = isRecord(body) && isRecord(body.data) ? body.data : body
  if (!isRecord(root) || !Array.isArray(root.models)) return []

  const models: StatsModel[] = []
  for (const entry of root.models) {
    if (!isRecord(entry) || !isRecord(entry.model)) continue
    const modelID = entry.model.id
    const providerID = entry.model.providerID
    if (typeof modelID !== "string" || typeof providerID !== "string") continue
    const cost =
      typeof entry.cost === "number" && Number.isFinite(entry.cost) ? entry.cost : 0
    const tokens = isRecord(entry.tokens) ? countTokens(entry.tokens) : 0
    models.push({ providerID, modelID, cost, tokens })
  }
  return models
}

export function mergeModelUsage(
  monthly: StatsModel[],
  weekly: StatsModel[],
  rolling: StatsModel[],
): ModelUsage[] {
  const models = new Map<string, ModelUsage>()

  const add = (entries: StatsModel[], range: "monthly" | "weekly" | "rolling") => {
    for (const entry of entries) {
      if (entry.providerID !== "opencode-go") continue
      const key = `${entry.providerID}/${entry.modelID}`
      let model = models.get(key)
      if (!model) {
        model = {
          providerID: entry.providerID,
          modelID: entry.modelID,
          name: modelDisplayName(entry.modelID),
          monthlyCost: 0,
          weeklyCost: 0,
          rollingCost: 0,
          monthlyTokens: 0,
        }
        models.set(key, model)
      }
      if (range === "monthly") {
        model.monthlyCost += entry.cost
        model.monthlyTokens += entry.tokens
      } else if (range === "weekly") {
        model.weeklyCost += entry.cost
      } else {
        model.rollingCost += entry.cost
      }
    }
  }

  add(monthly, "monthly")
  add(weekly, "weekly")
  add(rolling, "rolling")

  return [...models.values()].sort(
    (left, right) => right.monthlyCost - left.monthlyCost || left.name.localeCompare(right.name),
  )
}

export function windowPercent(
  cost: number,
  allowance: number | undefined,
  kind: WindowKey,
): number | undefined {
  if (!allowance || allowance <= 0) return undefined
  const fraction = kind === "rolling" ? 0.2 : kind === "weekly" ? 0.5 : 1
  const limit = allowance * fraction
  if (limit <= 0) return undefined
  return (cost / limit) * 100
}

export function totalModelPercent(
  models: readonly ModelUsage[],
  overrides: Record<string, number> | undefined,
  kind: WindowKey,
): number {
  return models.reduce((total, model) => {
    const cost =
      kind === "rolling"
        ? model.rollingCost
        : kind === "weekly"
          ? model.weeklyCost
          : model.monthlyCost
    const allowance = modelAllowance(model.modelID, overrides)
    return total + (windowPercent(cost, allowance, kind) ?? 0)
  }, 0)
}

export function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return "$0.00"
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent1(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export function subtractMonth(ms: number): number {
  const date = new Date(ms)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - 1)
  const days = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(day, days))
  return date.getTime()
}

export function actionLabel(action: StatusCopy["action"]): string {
  switch (action) {
    case "connect":
      return "Connect OpenCode Go"
    case "usage":
      return "Open built-in Usage"
    case "console":
      return "Open Console"
    case "retry":
      return "Retry"
    case "none":
      return ""
  }
}

export function noticeFor(result: UsageResult | undefined): StatusCopy | undefined {
  if (!result || result.state === "ok") return undefined
  return statusCopy(result)
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
