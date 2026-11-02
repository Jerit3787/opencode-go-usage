import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import type { UsageResult } from "./usage"

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
  const [result, setResult] = createSignal<UsageResult>()
  const [loading, setLoading] = createSignal(false)
  const [server, setServer] = createSignal<string>()

  const refresh = async (opts: { force?: boolean; server?: string } = {}) => {
    setLoading(true)
    try {
      const input: { server?: string; force?: boolean } = {}
      const target = opts.server ?? server()
      if (target) input.server = target
      if (opts.force) input.force = true
      setResult(await ctx.main(UsageIpc).get(input))
    } catch {
      setResult({ state: "error", message: "Usage couldn't be loaded." })
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => {
    const next = ctx.sessions.current()?.server.id
    if (next && next !== server()) {
      setServer(next)
      void refresh({ server: next })
    }
  })

  void refresh()
  const timer = setInterval(() => void refresh(), 60_000)
  onCleanup(() => clearInterval(timer))

  return {
    result,
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
