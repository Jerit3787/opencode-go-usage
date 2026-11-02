import { afterEach, expect, it, vi } from "vitest"
import { main } from "./main"
import { USAGE_URL } from "./request"
import { dataOf, type UsageResult } from "./usage"

const okBody = {
  usage: {
    rolling: { status: "ok", percent: 27, resetsAt: "2026-11-02T18:40:00.000Z" },
    weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
    monthly: { status: "ok", percent: 78, resetsAt: "2026-11-22T04:08:19.000Z" },
  },
}

type Impl = { get(input: { server?: string; force?: boolean }): Promise<UsageResult> }

function setup() {
  let impl: Impl | undefined
  const ctx = {
    serverEndpoints: {
      get: (id: string) =>
        id === "sidecar"
          ? { url: "http://localhost:1234", headers: { Authorization: "Bearer server" } }
          : undefined,
    },
    provide: (_ipc: unknown, value: Impl) => {
      impl = value
    },
  }
  main(ctx as never)
  if (!impl) throw new Error("main did not provide the Ipc")
  return impl
}

function stubFetch(usageResponses: Array<() => Promise<Response>>) {
  const calls: string[] = []
  const fake = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.includes("/api/credential")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "cred_1",
              integrationID: "opencode-go",
              label: "OpenCode Go",
              active: true,
              value: { type: "key", key: "oc_sk_test" },
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url === USAGE_URL) {
      const next = usageResponses.shift()
      if (!next) throw new Error("unexpected usage request")
      return next()
    }
    throw new Error(`unexpected request ${url}`)
  })
  vi.stubGlobal("fetch", fake)
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it("caches a success per server and credential, and force bypasses it", async () => {
  const calls = stubFetch([
    async () => new Response(JSON.stringify(okBody), { status: 200 }),
    async () => new Response(JSON.stringify(okBody), { status: 200 }),
  ])
  const get = setup()

  const first = await get.get({ server: "sidecar" })
  expect(first.state).toBe("ok")

  const second = await get.get({ server: "sidecar" })
  expect(second).toEqual(first)
  expect(calls.filter((url) => url === USAGE_URL)).toHaveLength(1)

  const forced = await get.get({ server: "sidecar", force: true })
  expect(forced.state).toBe("ok")
  expect(calls.filter((url) => url === USAGE_URL)).toHaveLength(2)
})

it("keeps the last good reading when a forced refresh fails", async () => {
  stubFetch([
    async () => new Response(JSON.stringify(okBody), { status: 200 }),
    async () => {
      throw new Error("offline")
    },
  ])
  const get = setup()

  await get.get({ server: "sidecar" })
  const stale = await get.get({ server: "sidecar", force: true })
  expect(stale.state).toBe("error")
  expect(dataOf(stale)?.stale).toBe(true)
  expect(dataOf(stale)?.windows.monthly.percent).toBe(78)
})

it("reports an unavailable server instead of signed out", async () => {
  stubFetch([])
  const get = setup()
  const result = await get.get({ server: "remote" })
  expect(result.state).toBe("unavailable")
})
