import { expect, it } from "vitest"
import {
  actionLabel,
  cacheKey,
  cacheTtl,
  clampPercent,
  configuredPlan,
  dataOf,
  formatPercent,
  formatPercent1,
  formatReset,
  formatTokens,
  formatUnitUSD,
  formatUSD,
  formatUpdated,
  goPlanName,
  mergeModelUsage,
  modelAllowance,
  modelDisplayName,
  noticeFor,
  parseConsoleModels,
  parseGoPlan,
  parseStatsModels,
  parseUsageLimits,
  parseUsageResponse,
  pillView,
  pruneOldest,
  ringOffset,
  statusCopy,
  subtractMonth,
  totalModelPercent,
  windowPercent,
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

it("parses the Console workspace usage limits", () => {
  const data = parseUsageLimits(
    {
      data: {
        workspace: {
          id: "org_1",
          name: "Personal",
          usageURL: "https://opencode.ai/console/org_1/activity/overview",
        },
        go: {
          rolling: { percent: 10, limited: false, resetsAt: NOW + 1000 },
          weekly: { percent: 22, limited: false, resetsAt: NOW + 2000 },
          monthly: { percent: 83, limited: false, resetsAt: NOW + 3000 },
        },
        budgets: [],
      },
    },
    NOW,
  )

  expect(data).not.toBeNull()
  expect(data!.windows.monthly).toEqual({
    percent: 83,
    limited: false,
    resetsAt: NOW + 3000,
  })
  expect(data!.workspace).toEqual({
    id: "org_1",
    name: "Personal",
    usageURL: "https://opencode.ai/console/org_1/activity/overview",
  })
  expect(parseUsageLimits({ data: null }, NOW)).toBeNull()
})

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
  expect(
    formatReset(Date.UTC(2026, 10, 2, 18, 0), NOW, { timeZone: "UTC", kind: "weekly" }),
  ).toBe("Resets Mon 6:00 PM")
  expect(
    formatReset(Date.UTC(2026, 10, 2, 18, 0), NOW, { timeZone: "UTC", kind: "monthly" }),
  ).toBe("Resets 2 Nov 6:00 PM")
  expect(
    formatReset(Date.UTC(2026, 10, 2, 18, 40), NOW, { timeZone: "UTC", kind: "rolling" }),
  ).toBe("Resets at 6:40 PM")
  expect(formatReset(0, NOW, { timeZone: "UTC" })).toBe("Reset time unavailable")
  expect(formatUpdated(NOW - 30_000, NOW, { timeZone: "UTC" })).toBe("Updated just now")
  expect(formatUpdated(NOW - 5 * 60_000, NOW, { timeZone: "UTC" })).toBe("Updated 5m ago")
  expect(formatUpdated(NOW - 2 * 60 * 60_000, NOW, { timeZone: "UTC" })).toBe(
    "Updated 10:00 AM",
  )
})

it("builds the pill label and keeps data on errors", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(pillView({ state: "ok", data })).toEqual({
    label: "mo 78%",
    tone: "warning",
    stale: false,
  })
  const low = parseUsageResponse(
    {
      usage: {
        ...body.usage,
        monthly: { status: "ok", percent: 20, resetsAt: body.usage.monthly.resetsAt },
      },
    },
    NOW,
  )!
  expect(pillView({ state: "ok", data: low })).toEqual({
    label: "5h 27%",
    tone: undefined,
    stale: false,
  })
  expect(pillView({ state: "rejected", message: "no" })).toEqual({
    label: "Go usage",
    tone: "danger",
    stale: false,
  })
  expect(pillView({ state: "error", message: "no" })).toEqual({
    label: "Go usage",
    tone: "warning",
    stale: false,
  })
  const stale = withStaleData({ state: "error", message: "offline" }, data)
  expect(dataOf(stale)?.stale).toBe(true)
  expect(dataOf(stale)?.error).toBe("offline")
  expect(dataOf({ state: "signed-out" })).toBeUndefined()
})

it("maps status copy and cache values", () => {
  expect(statusCopy({ state: "signed-out" }).action).toBe("connect")
  expect(statusCopy({ state: "console-only" }).action).toBe("console")
  expect(statusCopy({ state: "no-plan", message: "no" }).action).toBe("console")
  expect(statusCopy({ state: "unavailable", message: "no" }).action).toBe("retry")
  expect(statusCopy({ state: "error", message: "no" }).action).toBe("retry")
  expect(statusCopy({ state: "rejected", message: "no" }).action).toBe("connect")
  expect(cacheKey(undefined, "cred_1")).toBe("sidecar:cred_1")
  expect(cacheKey("remote", "cred_1")).toBe("remote:cred_1")
  expect(cacheTtl({ state: "ok", data: parseUsageResponse(body, NOW)! })).toBe(45_000)
  expect(cacheTtl({ state: "error", message: "no" })).toBe(45_000)
  expect(formatPercent(27.6)).toBe("28%")
  expect(ringOffset(50, 64, 6)).toBeCloseTo(29 * Math.PI)
})

it("prunes the oldest map entries", () => {
  const map = new Map([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ])
  pruneOldest(map, 2)
  expect([...map.keys()]).toEqual(["b", "c"])
})

it("parses and merges per-model session stats", () => {
  const body = {
    data: {
      models: [
        {
          model: { id: "deepseek-v4.1-flash", providerID: "opencode-go", variant: "max" },
          cost: 9.3,
          tokens: { input: 100, output: 50, reasoning: 25, cache: { read: 1000, write: 0 } },
        },
        {
          model: { id: "deepseek-v4.1-flash", providerID: "opencode-go", variant: "default" },
          cost: 3.2,
          tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 100, write: 0 } },
        },
        {
          model: { id: "glm-5.3", providerID: "afiqstore", variant: "default" },
          cost: 4,
          tokens: { input: 1, output: 1, reasoning: 1, cache: { read: 1, write: 1 } },
        },
      ],
    },
  }

  const parsed = parseStatsModels(body)
  expect(parsed).toHaveLength(3)
  expect(parsed[0]).toEqual({
    providerID: "opencode-go",
    modelID: "deepseek-v4.1-flash",
    cost: 9.3,
    tokens: 1175,
  })

  const merged = mergeModelUsage(parsed, parsed, parsed)
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({
    modelID: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    monthlyCost: 12.5,
    weeklyCost: 12.5,
    rollingCost: 12.5,
    monthlyTokens: 1292,
  })
})

it("calculates per-model window percentages and allowances", () => {
  expect(windowPercent(10, 100, "rolling")).toBe(50)
  expect(windowPercent(25, 100, "weekly")).toBe(50)
  expect(windowPercent(50, 100, "monthly")).toBe(50)
  expect(windowPercent(50, undefined, "monthly")).toBeUndefined()
  expect(modelAllowance("deepseek-v4.1-flash")).toBe(100)
  expect(modelAllowance("deepseek-v4-pro")).toBe(15)
  expect(modelAllowance("deepseek-v4.1-flash", undefined, "go-plus")).toBe(200)
  expect(modelAllowance("deepseek-v4-pro", undefined, "go-plus")).toBe(60)
  expect(modelAllowance("deepseek-v4.1-flash", undefined, "go-teams")).toBe(105)
  expect(modelAllowance("deepseek-v4-pro", undefined, "go-teams")).toBe(20)
  expect(modelAllowance("hy4", undefined, "go-teams")).toBe(65)
  expect(modelAllowance("deepseek-v4.1-flash", { "deepseek-v4.1-flash": 16 })).toBe(16)
  expect(modelAllowance("deepseek-v4.1-flash", { "deepseek-v4.1-flash": 16 }, "go-teams")).toBe(16)
  expect(modelAllowance("unknown")).toBeUndefined()
  expect(configuredPlan("go-plus")).toBe("go-plus")
  expect(configuredPlan("go-teams")).toBe("go-teams")
  expect(configuredPlan("other")).toBeUndefined()
  expect(goPlanName("go-plus")).toBe("Go Plus")
  expect(goPlanName("go-teams")).toBe("Go Teams")
  expect(modelDisplayName("deepseek-v4-pro")).toBe("DeepSeek V4 Pro")
  expect(modelDisplayName("some-new-model")).toBe("Some New Model")
  expect(subtractMonth(Date.UTC(2026, 10, 22))).toBe(Date.UTC(2026, 9, 22))
  expect(subtractMonth(Date.UTC(2026, 2, 31))).toBe(Date.UTC(2026, 1, 28))
  expect(formatUSD(12.587)).toBe("$12.59")
  expect(formatUSD(0.0016)).toBe("$0.0016")
  expect(formatUnitUSD(0.01279)).toBe("$0.01279")
  expect(formatUnitUSD(0.0000536)).toBe("$0.000054")
  expect(formatUnitUSD(107.85)).toBe("$107.85")
  expect(formatUnitUSD(0)).toBe("$0.00")
  expect(formatPercent1(12.58)).toBe("12.6%")
  expect(formatTokens(1_200_000)).toBe("1.2M")
})

it("detects the active Go plan from the latest paid Console invoice", () => {
  expect(
    parseGoPlan([
      {
        attemptType: "go_initial",
        product: "go",
        status: "paid",
        paidAt: "2026-10-22T04:08:19.000Z",
      },
      {
        attemptType: "go_upgrade",
        product: "go-teams",
        status: "paid",
        paidAt: "2026-11-05T07:00:06.000Z",
      },
      {
        attemptType: "go_upgrade",
        product: "go-plus",
        status: "pending",
        paidAt: "2026-12-01T00:00:00.000Z",
      },
    ]),
  ).toBe("go-teams")
  expect(
    parseGoPlan([
      {
        attemptType: "go_renewal",
        product: "go-plus",
        status: "paid",
        paidAt: "2026-11-20T00:00:00.000Z",
      },
    ]),
  ).toBe("go-plus")
  expect(
    parseGoPlan([
      {
        attemptType: "credit_purchase",
        product: "go-teams",
        status: "paid",
        paidAt: "2026-11-20T00:00:00.000Z",
      },
    ]),
  ).toBeUndefined()
  expect(parseGoPlan({})).toBeUndefined()
})

it("parses Console per-model costs and token totals", () => {
  const models = parseConsoleModels({
    items: [
      {
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
        totalCostMicroCents: "3163470740",
        totalRequests: "7610",
        totalInputTokens: "68789760",
        totalOutputTokens: "7430716",
        totalCacheReadTokens: "2991292170",
        totalCacheWrite5mTokens: "0",
        totalCacheWrite1hTokens: "0",
      },
      {
        provider: "opencode-go",
        model: "deepseek-v4-pro",
        totalCostMicroCents: "742366702",
        totalRequests: "686",
        totalInputTokens: "2946923",
        totalOutputTokens: "530766",
        totalCacheReadTokens: "139498752",
      },
      {
        provider: "opencode",
        model: "deepseek-v4.1-flash-free",
        totalCostMicroCents: "0",
        totalRequests: "545",
      },
      null,
    ],
  })

  expect(models).toHaveLength(2)
  expect(models[0]).toMatchObject({
    providerID: "opencode-go",
    modelID: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    cost: 31.6347074,
    requests: 7610,
    tokens: 3067512646,
  })
  expect(models[1]).toMatchObject({
    modelID: "deepseek-v4-pro",
    cost: 7.42366702,
    requests: 686,
    tokens: 142976441,
  })
  expect(parseConsoleModels({ items: "not-an-array" })).toEqual([])
})

it("sums per-model percentages into the pooled monthly total", () => {
  const models = [
    {
      providerID: "opencode-go",
      modelID: "deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash",
      monthlyCost: 50,
      weeklyCost: 25,
      rollingCost: 10,
      monthlyTokens: 0,
    },
    {
      providerID: "opencode-go",
      modelID: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      monthlyCost: 7.5,
      weeklyCost: 3.75,
      rollingCost: 1.5,
      monthlyTokens: 0,
    },
  ]
  expect(totalModelPercent(models, undefined, "monthly")).toBe(100)
  expect(totalModelPercent(models, undefined, "weekly")).toBe(100)
  expect(totalModelPercent(models, undefined, "rolling")).toBe(100)
  expect(
    totalModelPercent(
      models,
      { "deepseek-v4.1-flash": 200, "deepseek-v4-pro": 15 },
      "monthly",
    ),
  ).toBe(75)
})

it("maps state actions and notices, including stale data", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(actionLabel("connect")).toBe("Connect OpenCode Go")
  expect(actionLabel("console")).toBe("Open Console")
  expect(actionLabel("retry")).toBe("Retry")
  expect(actionLabel("none")).toBe("")
  expect(noticeFor({ state: "ok", data })).toBeUndefined()
  expect(noticeFor({ state: "error", message: "no", data })?.title).toBe(
    "Usage couldn't be loaded",
  )
  expect(noticeFor({ state: "signed-out" })?.action).toBe("connect")
  expect(noticeFor({ state: "console-only" })?.action).toBe("console")
  expect(noticeFor({ state: "no-plan", message: "no", data })?.action).toBe("console")
  expect(noticeFor({ state: "unavailable", message: "no", data })?.action).toBe("retry")
  expect(pillView({ state: "console-only" })).toEqual({
    label: "Go usage",
    tone: undefined,
    stale: false,
  })
  expect(pillView({ state: "no-plan", message: "no" })).toEqual({
    label: "Go usage",
    tone: undefined,
    stale: false,
  })
  expect(pillView({ state: "unavailable", message: "no" })).toEqual({
    label: "Go usage",
    tone: "warning",
    stale: false,
  })
  const stale = withStaleData({ state: "error", message: "offline" }, data)
  expect(pillView(stale)).toEqual({ label: "mo 78%", tone: "warning", stale: true })
})
