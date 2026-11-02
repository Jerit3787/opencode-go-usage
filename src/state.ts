import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import { dataOf, withStaleData, type UsageResult } from "./usage"

export type UsageState = {
  result: () => UsageResult | undefined
  loading: () => boolean
  server: () => string | undefined
  refresh(opts?: { force?: boolean; server?: string }): Promise<void>
  openSettings(): void
  connect(): void
  openBuiltinUsage(): void
  openConsole(): void
}

export function createUsageState(ctx: Context): UsageState {
  const [rawResult, setResult] = createSignal<UsageResult>()
  const [resultServer, setResultServer] = createSignal<string>()
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
      setResult(next)
    } catch {
      if (request !== generation) return

      const previous = resultServer() === target ? dataOf(rawResult()) : undefined
      setResultServer(target)
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
    server,
    refresh,
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
