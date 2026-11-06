import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { main } from "./main"
import { USAGE_URL } from "./request"
import { dataOf, type ConsoleModelResult, type UsageResult } from "./usage"

const okBody = {
  usage: {
    rolling: { status: "ok", percent: 27, resetsAt: "2026-11-02T18:40:00.000Z" },
    weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
    monthly: { status: "ok", percent: 78, resetsAt: "2026-11-22T04:08:19.000Z" },
  },
}

function usageBody(percent: number) {
  return {
    usage: {
      rolling: {
        status: "ok",
        percent,
        resetsAt: "2026-11-02T18:40:00.000Z",
      },
      weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
      monthly: { status: "ok", percent: 50, resetsAt: "2026-11-22T04:08:19.000Z" },
    },
  }
}

const credentialBody = {
  data: [
    {
      id: "cred_1",
      integrationID: "opencode-go",
      label: "OpenCode Go",
      active: true,
      value: { type: "key", key: "oc_sk_test" },
    },
  ],
}

type Impl = {
  get(input: { server?: string; force?: boolean }): Promise<UsageResult>
  consoleModels(input: { server?: string; force?: boolean }): Promise<ConsoleModelResult>
}

const originalXdg = process.env.XDG_DATA_HOME
const originalEnvKey = process.env.OPENCODE_GO_API_KEY
const tempDirs: string[] = []
let lastLog: ReturnType<typeof vi.fn> | undefined

function setup() {
  let impl: Impl | undefined
  const log = vi.fn()
  lastLog = log
  const ctx = {
    serverEndpoints: {
      get: (id: string) =>
        id === "sidecar" || id === "remote"
          ? { url: `http://${id}:1234`, headers: { Authorization: "Bearer server" } }
          : undefined,
    },
    log: { write: log },
    provide: (_ipc: unknown, value: Impl) => {
      impl = value
    },
  }
  main(ctx as never)
  if (!impl) throw new Error("main did not provide the Ipc")
  return impl
}

async function useAuthFile(contents?: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencode-go-usage-"))
  tempDirs.push(dir)
  await mkdir(join(dir, "opencode"), { recursive: true })
  if (contents) {
    await writeFile(join(dir, "opencode", "auth.json"), JSON.stringify(contents), "utf8")
  }
  process.env.XDG_DATA_HOME = dir
  return dir
}

afterEach(async () => {
  vi.unstubAllGlobals()
  lastLog = undefined
  if (originalXdg === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = originalXdg
  if (originalEnvKey === undefined) delete process.env.OPENCODE_GO_API_KEY
  else process.env.OPENCODE_GO_API_KEY = originalEnvKey
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

it("caches a success per server and credential, and force bypasses it", async () => {
  const calls: string[] = []
  const usageResponses = [
    async () => new Response(JSON.stringify(okBody), { status: 200 }),
    async () => new Response(JSON.stringify(okBody), { status: 200 }),
  ]
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (url === USAGE_URL) {
        const next = usageResponses.shift()
        if (!next) throw new Error("unexpected usage request")
        return next()
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )
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

it("prefers the signed-in Console usage limits", async () => {
  const consoleBody = {
    data: {
      workspace: {
        id: "org_1",
        name: "Personal",
        usageURL: "https://opencode.ai/console/org_1/activity/overview",
      },
      go: {
        rolling: { percent: 10, limited: false, resetsAt: Date.now() + 1000 },
        weekly: { percent: 22, limited: false, resetsAt: Date.now() + 2000 },
        monthly: { percent: 83, limited: false, resetsAt: Date.now() + 3000 },
      },
      budgets: [],
    },
  }
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/experimental/usage/limits")) {
        return new Response(JSON.stringify(consoleBody), { status: 200 })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const result = await get.get({ server: "sidecar" })
  expect(result.state).toBe("ok")
  if (result.state === "ok") {
    expect(result.data.windows.monthly.percent).toBe(83)
    expect(result.data.workspace?.name).toBe("Personal")
  }
  expect(calls.filter((url) => url.includes("/api/credential"))).toHaveLength(0)
})

it("returns Console per-model spend for the signed-in workspace", async () => {
  const calls: string[] = []
  const consoleCredential = {
    id: "console",
    integrationID: "opencode",
    label: "Personal",
    active: true,
    value: {
      type: "oauth",
      access: "console-access",
      metadata: {
        server: "https://opencode.ai/console",
        orgID: "org_1",
        orgName: "Personal",
      },
    },
  }
  const models = {
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
    ],
  }

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify({ data: [consoleCredential] }), { status: 200 })
      }
      if (url.includes("/console/api/usage/models")) {
        return new Response(JSON.stringify(models), { status: 200 })
      }
      if (url.includes("/console/api/billing/credit-invoices")) {
        return new Response(
          JSON.stringify([
            {
              attemptType: "go_upgrade",
              product: "go-teams",
              status: "paid",
              paidAt: "2026-11-05T07:00:06.000Z",
            },
          ]),
          { status: 200 },
        )
      }
      if (url.includes("/console/api/activity/go")) {
        return new Response(
          JSON.stringify({
            startsAt: "2026-11-05T07:00:06.000Z",
            daily: [
              {
                date: "2026-11-05",
                totalCostMicroCents: "379773979",
                totalRequests: "1247",
              },
            ],
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )

  const api = setup()
  const result = await api.consoleModels({ server: "sidecar" })
  expect(result.state).toBe("ok")
  if (result.state === "ok") {
    expect(result.data.range).toBe("30d")
    expect(result.data.source).toBe("server")
    expect(result.data.plan).toBe("go-teams")
    expect(result.data.activity?.daily[0].cost).toBeCloseTo(3.79773979)
    expect(result.data.models).toHaveLength(2)
    expect(result.data.models[0].modelID).toBe("deepseek-v4.1-flash")
    expect(result.data.models[0].cost).toBeCloseTo(31.6347074)
    expect(result.data.models[1].cost).toBeCloseTo(7.42366702)
    expect(result.data.totalCost).toBeCloseTo(39.05837442)
  }

  const modelCall = calls.find((url) => url.includes("/console/api/usage/models"))
  expect(modelCall).toContain("range=30d")
  expect(modelCall).toContain("pageSize=100")

  await api.consoleModels({ server: "sidecar" })
  expect(calls.filter((url) => url.includes("/console/api/usage/models"))).toHaveLength(1)
})

it("prefers this desktop's Console account for a remote server", async () => {
  const consoleCredential = {
    id: "console",
    integrationID: "opencode",
    label: "Personal",
    active: true,
    value: {
      type: "oauth",
      access: "console-access",
      metadata: {
        server: "https://opencode.ai/console",
        orgID: "org_1",
        orgName: "Personal",
      },
    },
  }
  const models = {
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
    ],
  }
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith("http://remote:1234/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (url.startsWith("http://sidecar:1234/api/credential")) {
        return new Response(JSON.stringify({ data: [consoleCredential] }), { status: 200 })
      }
      if (url.includes("/console/api/usage/models")) {
        return new Response(JSON.stringify(models), { status: 200 })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )

  const api = setup()
  const result = await api.consoleModels({ server: "remote" })
  expect(result.state).toBe("ok")
  if (result.state === "ok") {
    expect(result.data.source).toBe("desktop")
    expect(result.data.models[0].modelID).toBe("deepseek-v4.1-flash")
  }
  expect(calls.some((url) => url.startsWith("http://sidecar:1234/api/credential"))).toBe(true)
  expect(calls.some((url) => url.startsWith("http://remote:1234/api/credential"))).toBe(false)
})

it("falls back to the remote Console account when the desktop has none", async () => {
  const remoteConsole = {
    id: "remote-console",
    integrationID: "opencode",
    label: "Remote",
    active: true,
    value: {
      type: "oauth",
      access: "remote-access",
      metadata: {
        server: "https://opencode.ai/console",
        orgID: "org_remote",
      },
    },
  }
  const models = {
    items: [
      {
        provider: "opencode-go",
        model: "deepseek-v4-pro",
        totalCostMicroCents: "742366702",
        totalRequests: "686",
        totalInputTokens: "2946923",
        totalOutputTokens: "530766",
        totalCacheReadTokens: "139498752",
      },
    ],
  }
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith("http://sidecar:1234/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (url.startsWith("http://remote:1234/api/credential")) {
        return new Response(JSON.stringify({ data: [remoteConsole] }), { status: 200 })
      }
      if (url.includes("/console/api/usage/models")) {
        return new Response(JSON.stringify(models), { status: 200 })
      }
      if (url.includes("/console/api/billing/credit-invoices")) {
        return new Response("[]", { status: 200 })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )

  const api = setup()
  const result = await api.consoleModels({ server: "remote" })
  expect(result.state).toBe("ok")
  if (result.state === "ok") {
    expect(result.data.source).toBe("server")
    expect(result.data.plan).toBe("go")
  }
  expect(calls.some((url) => url.startsWith("http://sidecar:1234/api/credential"))).toBe(true)
  expect(calls.some((url) => url.startsWith("http://remote:1234/api/credential"))).toBe(true)
})

it("reports an error when Console isn't signed in for per-model spend", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )

  const api = setup()
  const result = await api.consoleModels({ server: "sidecar" })
  expect(result).toEqual({
    state: "error",
    message: "Sign in to OpenCode Console to load per-model Console costs.",
  })
})

it("keeps the last good reading when a forced refresh fails", async () => {
  let fail = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (fail) throw new Error("offline")
      return new Response(JSON.stringify(okBody), { status: 200 })
    }),
  )
  const get = setup()

  await get.get({ server: "sidecar" })
  fail = true
  const stale = await get.get({ server: "sidecar", force: true })
  expect(stale.state).toBe("error")
  expect(dataOf(stale)?.stale).toBe(true)
  expect(dataOf(stale)?.windows.monthly.percent).toBe(78)
})

it("reports an unavailable server instead of signed out", async () => {
  await useAuthFile()
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
  const get = setup()
  const result = await get.get({ server: "missing" })
  expect(result.state).toBe("unavailable")
})

it("does not fall back to the local auth file for a remote server", async () => {
  await useAuthFile({ "opencode-go": { type: "key", key: "oc_sk_local" } })
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/credential")) return new Response("", { status: 500 })
      if (url === USAGE_URL) return new Response(JSON.stringify(okBody), { status: 200 })
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const result = await get.get({ server: "remote" })
  expect(result.state).toBe("unavailable")
  expect(calls.filter((url) => url === USAGE_URL)).toHaveLength(0)
})

it("treats an invalid credential response as unavailable", async () => {
  await useAuthFile()
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
  const get = setup()
  const result = await get.get({ server: "sidecar" })
  expect(result.state).toBe("unavailable")
})

it("falls back to the auth file when the sidecar returns no Go credential", async () => {
  await useAuthFile({ "opencode-go": { type: "key", key: "oc_sk_file" } })
  const auths: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }
      if (url === USAGE_URL) {
        auths.push((init?.headers as Record<string, string>).Authorization)
        return new Response(JSON.stringify(okBody), { status: 200 })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const result = await get.get({ server: "sidecar" })
  expect(result.state).toBe("ok")
  expect(auths).toEqual(["Bearer oc_sk_file"])
})

it("treats an auth-file OAuth entry as console-only", async () => {
  await useAuthFile({ "opencode-go": { type: "oauth" } })
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const result = await get.get({ server: "sidecar" })
  expect(result.state).toBe("console-only")
  expect(calls.filter((url) => url === USAGE_URL)).toHaveLength(0)
})

it("invalidates the auth-file cache when the key changes", async () => {
  const dir = await useAuthFile({ "opencode-go": { type: "key", key: "oc_sk_a" } })
  let usageCalls = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/credential")) return new Response("", { status: 500 })
      if (url === USAGE_URL) {
        usageCalls++
        const auth = (init?.headers as Record<string, string>).Authorization
        return new Response(JSON.stringify(usageBody(auth === "Bearer oc_sk_a" ? 10 : 20)), {
          status: 200,
        })
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()

  const first = await get.get({ server: "sidecar" })
  expect(dataOf(first)?.windows.rolling.percent).toBe(10)

  await writeFile(
    join(dir, "opencode", "auth.json"),
    JSON.stringify({ "opencode-go": { type: "key", key: "oc_sk_b" } }),
    "utf8",
  )
  const second = await get.get({ server: "sidecar" })
  expect(dataOf(second)?.windows.rolling.percent).toBe(20)
  expect(usageCalls).toBe(2)
})

it("uses OPENCODE_GO_API_KEY without reading the credential endpoint", async () => {
  process.env.OPENCODE_GO_API_KEY = "oc_sk_env"
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/credential")) throw new Error("credential endpoint must not be used")
      if (url === USAGE_URL) return new Response(JSON.stringify(okBody), { status: 200 })
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const result = await get.get({ server: "sidecar" })
  expect(result.state).toBe("ok")
  expect(calls.filter((url) => url === USAGE_URL)).toHaveLength(1)
})

it("coalesces concurrent requests for the same credential", async () => {
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => {
    release = resolve
  })
  let usageCalls = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (url === USAGE_URL) {
        usageCalls++
        return pending
      }
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const first = get.get({ server: "sidecar" })
  const second = get.get({ server: "sidecar" })

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(usageCalls).toBe(1)
  release(new Response(JSON.stringify(okBody), { status: 200 }))

  const [a, b] = await Promise.all([first, second])
  expect(a.state).toBe("ok")
  expect(b).toEqual(a)
})

it("logs a sanitized state change without the key", async () => {
  await useAuthFile()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/credential")) {
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (url === USAGE_URL) return new Response("{}", { status: 401 })
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()
  const result = await get.get({ server: "sidecar" })
  expect(result.state).toBe("rejected")
  expect(lastLog).toHaveBeenCalledWith("warn", "opencode-go usage unavailable", {
    server: "sidecar",
    state: "rejected",
  })
  expect(JSON.stringify(lastLog!.mock.calls)).not.toContain("oc_sk_test")
})

it("retains last good when the sidecar credential endpoint fails", async () => {
  await useAuthFile()
  let failCredentials = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/credential")) {
        if (failCredentials) return new Response("", { status: 500 })
        return new Response(JSON.stringify(credentialBody), { status: 200 })
      }
      if (url === USAGE_URL) return new Response(JSON.stringify(okBody), { status: 200 })
      throw new Error(`unexpected request ${url}`)
    }),
  )
  const get = setup()

  await get.get({ server: "sidecar" })
  failCredentials = true
  const stale = await get.get({ server: "sidecar", force: true })
  expect(stale.state).toBe("unavailable")
  expect(dataOf(stale)?.stale).toBe(true)
  expect(dataOf(stale)?.windows.monthly.percent).toBe(78)
})
