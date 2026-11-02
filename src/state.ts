import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import {
  dataOf,
  mergeModelUsage,
  parseStatsModels,
  subtractMonth,
  withStaleData,
  type ModelAnalyticsResult,
  type UsageResult,
} from "./usage"

export type UsageState = {
  result: () => UsageResult | undefined
  loading: () => boolean
  initialLoading: () => boolean
  models: () => ModelAnalyticsResult | undefined
  modelsLoading: () => boolean
  server: () => string | undefined
  refresh(opts?: { force?: boolean; server?: string }): Promise<void>
  refreshModels(opts?: { force?: boolean; server?: string }): Promise<void>
  openSettings(): void
  connect(): void
  openBuiltinUsage(): void
  openConsole(): void
}

export function createUsageState(ctx: Context): UsageState {
  const [rawResult, setResult] = createSignal<UsageResult>()
  const [resultServer, setResultServer] = createSignal<string>()
  const [settledServer, setSettledServer] = createSignal<string>()
  const [models, setModels] = createSignal<ModelAnalyticsResult>()
  const [modelsLoading, setModelsLoading] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [server, setServer] = createSignal<string>()
  let generation = 0

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

  const refreshModels = async (opts: { force?: boolean; server?: string } = {}) => {
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
    server,
    refresh,
    refreshModels,
    openSettings: () => ctx.layout.settings("opencode-go-usage"),
    connect: () => {
      if (!ctx.commands.run("provider.connect")) {
        ctx.toast.show({ title: "Run /connect to add OpenCode Go.", variant: "error" })
      }
    },
    openBuiltinUsage: () => {
      if (!ctx.commands.run("usage.view")) ctx.system.openExternal("https://opencode.ai/console")
    },
    openConsole: () => ctx.system.openExternal("https://opencode.ai/console"),
  }
}
