import { createRoot, createSignal } from "solid-js"
import { expect, it, vi } from "vitest"
import { createUsageState, type UsageState } from "./state"
import type { UsageResult } from "./usage"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function ok(percent: number): UsageResult {
  return {
    state: "ok",
    data: {
      windows: {
        rolling: { percent, limited: false, resetsAt: Date.now() + 60_000 },
        weekly: { percent: 10, limited: false, resetsAt: Date.now() + 60_000 },
        monthly: { percent: 20, limited: false, resetsAt: Date.now() + 60_000 },
      },
      updatedAt: Date.now(),
      stale: false,
    },
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeContext(
  current: () => { server: { id: string } } | undefined,
  get: (input: { server?: string; force?: boolean }) => Promise<UsageResult>,
) {
  return {
    main: () => ({ get }),
    sessions: { current },
    layout: { settings: vi.fn() },
    commands: { run: () => false },
    toast: { show: vi.fn() },
    system: { openExternal: vi.fn() },
  }
}

it("ignores an older server response and hides another server's reading", async () => {
  const [current, setCurrent] = createSignal<{ server: { id: string } } | undefined>({
    server: { id: "a" },
  })
  const a = deferred<UsageResult>()
  const b = deferred<UsageResult>()
  const calls: string[] = []

  const ctx = makeContext(current, (input) => {
    const id = input.server ?? "sidecar"
    calls.push(id)
    return id === "a" ? a.promise : b.promise
  })

  let state!: UsageState
  const dispose = createRoot((cleanup) => {
    state = createUsageState(ctx as never)
    return cleanup
  })

  await tick()
  expect(calls).toContain("a")
  expect(state.result()).toBeUndefined()
  expect(state.initialLoading()).toBe(true)

  setCurrent({ server: { id: "b" } })
  await tick()
  expect(calls).toContain("b")
  expect(state.result()).toBeUndefined()

  b.resolve(ok(20))
  await tick()
  const afterB = state.result()
  expect(afterB?.state).toBe("ok")
  expect(state.initialLoading()).toBe(false)
  if (afterB?.state === "ok") {
    expect(afterB.data.windows.rolling.percent).toBe(20)
  }

  a.resolve(ok(10))
  await tick()
  const afterA = state.result()
  if (afterA?.state === "ok") {
    expect(afterA.data.windows.rolling.percent).toBe(20)
  }

  dispose()
})

it("keeps the last reading when a refresh rejects", async () => {
  const [current] = createSignal<{ server: { id: string } } | undefined>({
    server: { id: "sidecar" },
  })
  let fail = false
  const ctx = makeContext(current, async () => {
    if (fail) throw new Error("offline")
    return ok(20)
  })

  let state!: UsageState
  const dispose = createRoot((cleanup) => {
    state = createUsageState(ctx as never)
    return cleanup
  })

  await tick()
  expect(state.result()?.state).toBe("ok")
  expect(state.initialLoading()).toBe(false)

  fail = true
  await state.refresh({ server: "sidecar", force: true })
  const stale = state.result()
  expect(stale?.state).toBe("error")
  if (stale?.state === "error") {
    expect(stale.data?.stale).toBe(true)
    expect(stale.data?.windows.rolling.percent).toBe(20)
  }

  dispose()
})
