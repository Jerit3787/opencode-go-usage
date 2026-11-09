import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import {
  configuredPlan,
  consoleRangeAttempts,
  dataOf,
  mergeModelUsage,
  parseStatsModels,
  subtractMonth,
  withStaleData,
  type ConsoleModelResult,
  type GoPlan,
  type ModelAnalyticsResult,
  type UsageResult,
} from "./usage"

export type UsageState = {
  result: () => UsageResult | undefined
  loading: () => boolean
  initialLoading: () => boolean
  models: () => ModelAnalyticsResult | undefined
  modelsLoading: () => boolean
  consoleModels: () => ConsoleModelResult | undefined
  consoleModelsLoading: () => boolean
  plan: () => GoPlan
  server: () => string | undefined
  refresh(opts?: { force?: boolean; server?: string }): Promise<void>
  refreshModels(opts?: { force?: boolean; server?: string }): Promise<void>
  openSettings(): void
  connect(): void
  openConsole(): void
}

export function createUsageState(ctx: Context): UsageState {
  const [rawResult, setResult] = createSignal<UsageResult>()
  const [resultServer, setResultServer] = createSignal<string>()
  const [settledServer, setSettledServer] = createSignal<string>()
  const [models, setModels] = createSignal<ModelAnalyticsResult>()
  const [modelsLoading, setModelsLoading] = createSignal(false)
  const [consoleModels, setConsoleModels] = createSignal<ConsoleModelResult>()
  const [consoleModelsLoading, setConsoleModelsLoading] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [server, setServer] = createSignal<string>()
  let generation = 0
  let consoleGeneration = 0

  const visible = () => {
    const target = server() ?? "sidecar"
    return resultServer() === target ? rawResult() : undefined
  }

  const refresh = async (opts: { force?: boolean; server?: string } = {}) => {
    const target = opts.server ?? server() ?? "sidecar"
    if (target !== server()) setServer(target)

    const request = ++generation
    setLoading(true)

    try {
      const input: { server?: string; force?: boolean } = {}
      if (target) input.server = target
      if (opts.force) input.force = true

      const next = await ctx.main(UsageIpc).get(input)
      if (request !== generation) return

      setResultServer(target)
      setSettledServer(target)
      setResult(next)
    } catch {
      if (request !== generation) return

      const previous = resultServer() === target ? dataOf(rawResult()) : undefined
      setResultServer(target)
      setSettledServer(target)
      setResult(
        withStaleData(
          { state: "error", message: "Usage couldn't be loaded." },
          previous,
        ),
      )
    } finally {
      if (request === generation) setLoading(false)
    }
  }

  const refreshConsoleModels = async (
    opts: { force?: boolean; server?: string } = {},
  ) => {
    const target = opts.server ?? server() ?? "sidecar"
    const request = ++consoleGeneration
    setConsoleModelsLoading(true)

    try {
      const current = resultServer() === target ? dataOf(rawResult()) : undefined
      const monthlyReset = current?.windows.monthly.resetsAt
      const since =
        monthlyReset && monthlyReset > 0
          ? new Date(subtractMonth(monthlyReset)).toISOString()
          : undefined
      const from = since ? since.slice(0, 10) : undefined
      const to = from ? new Date().toISOString().slice(0, 10) : undefined

      const requestConsole = async (extra: {
        since?: string
        from?: string
        to?: string
      }) => {
        // The desktop is the primary Console account. Remote servers may have an
        // older or unrelated Console workspace, so try the desktop first.
        let result = await ctx.main(UsageIpc).consoleModels({
          server: "sidecar",
          force: true,
          ...extra,
        })
        if (result.state !== "ok" && target !== "sidecar") {
          result = await ctx.main(UsageIpc).consoleModels({
            server: target,
            force: true,
            ...extra,
          })
        }
        return result
      }

      const attempts = consoleRangeAttempts({ since, from, to })
      let result: ConsoleModelResult | undefined
      for (const extra of attempts) {
        try {
          const candidate = await requestConsole(extra)
          result = candidate
          if (candidate.state === "ok" && candidate.data.range === "period") break
        } catch {
          // Try the next range; the final failure is reported below.
        }
      }
      if (!result) throw new Error("console models unavailable")
      if (target !== "sidecar" && result.state === "ok" && result.data.source === "server") {
        result = { ...result, data: { ...result.data, source: "desktop" } }
      }
      if (request !== consoleGeneration) return
      setConsoleModels(result)
    } catch {
      if (request !== consoleGeneration) return
      setConsoleModels({
        state: "error",
        message: "Console model usage couldn't be loaded.",
      })
    } finally {
      if (request === consoleGeneration) setConsoleModelsLoading(false)
    }
  }

  const refreshModels = async (opts: { force?: boolean; server?: string } = {}) => {
    void refreshConsoleModels(opts)
    const target = opts.server ?? server() ?? "sidecar"
    const current = resultServer() === target ? dataOf(rawResult()) : undefined
    const now = Date.now()
    const monthlyFrom = current
      ? subtractMonth(current.windows.monthly.resetsAt)
      : now - 30 * 24 * 60 * 60 * 1000
    const weeklyFrom = now - 7 * 24 * 60 * 60 * 1000
    const rollingFrom = now - 5 * 60 * 60 * 1000

    const serverRef = ctx.servers.get(target)
    const client = serverRef?.client ?? (target === "sidecar" ? ctx.client : undefined)
    if (!client) {
      setModels({ state: "error", message: "Model usage couldn't be loaded." })
      return
    }

    setModelsLoading(true)
    try {
      const [monthly, weekly, rolling] = await Promise.all([
        client.experimental.session.stats({ from: monthlyFrom, to: now, tools: "none" }),
        client.experimental.session.stats({ from: weeklyFrom, to: now, tools: "none" }),
        client.experimental.session.stats({ from: rollingFrom, to: now, tools: "none" }),
      ])
      const models = mergeModelUsage(
        parseStatsModels(monthly),
        parseStatsModels(weekly),
        parseStatsModels(rolling),
      )
      setModels({
        state: "ok",
        data: {
          models,
          monthlyFrom,
          monthlyTo: now,
          weeklyFrom,
          rollingFrom,
          totalMonthlyCost: models.reduce((total, model) => total + model.monthlyCost, 0),
          serverMonthlyPercent: current?.windows.monthly.percent ?? 0,
        },
      })
    } catch {
      setModels({ state: "error", message: "Model usage couldn't be loaded." })
    } finally {
      setModelsLoading(false)
    }
  }

  const initial = ctx.sessions.current()?.server.id
  if (initial) setServer(initial)
  void refresh({ server: initial })
  void refreshConsoleModels({ server: initial })

  createEffect(() => {
    const next = ctx.sessions.current()?.server.id
    if (next && next !== server()) {
      setServer(next)
      void refresh({ server: next })
    }
  })

  const timer = setInterval(() => void refresh(), 60_000)
  onCleanup(() => clearInterval(timer))

  return {
    result: visible,
    loading,
    initialLoading: () => loading() && settledServer() !== (server() ?? "sidecar"),
    models,
    modelsLoading,
    consoleModels,
    consoleModelsLoading,
    plan: () => {
      const result = consoleModels()
      if (result?.state === "ok") return result.data.plan
      return configuredPlan(ctx.options.plan) ?? "go"
    },
    server,
    refresh,
    refreshModels,
    openSettings: () => ctx.layout.settings("opencode-go-usage"),
    connect: () => {
      if (!ctx.commands.run("provider.connect")) {
        ctx.toast.show({ title: "Run /connect to add OpenCode Go.", variant: "error" })
      }
    },
    openConsole: () =>
      ctx.system.openExternal(
        dataOf(rawResult())?.workspace?.usageURL ?? "https://opencode.ai/console",
      ),
  }
}
