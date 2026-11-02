import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import {
  readAuthFile,
  selectConsoleCredential,
  selectGoCredential,
  type CredentialChoice,
} from "./credentials"
import { requestUsage } from "./request"
import {
  cacheKey,
  cacheTtl,
  dataOf,
  parseConsoleModels,
  parseUsageLimits,
  pruneOldest,
  withStaleData,
  type ConsoleModelResult,
  type UsageData,
  type UsageResult,
} from "./usage"

const FETCH_TIMEOUT_MS = 10_000
const MODEL_CACHE_TTL_MS = 45_000
const MAX_ENTRIES = 32

function authFilePath(): string | undefined {
  if (process.platform === "win32") return undefined
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "auth.json")
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16)
}

type ServerEndpoint = {
  url: string
  headers: Readonly<Record<string, string>>
}

export const main: Plugin.MainSetup = (ctx) => {
  const cache = new Map<string, { at: number; result: UsageResult; lastGood?: UsageData }>()
  const lastGoodByServer = new Map<string, UsageData>()
  const inFlight = new Map<string, Promise<UsageResult>>()
  const loggedState = new Map<string, string>()
  const consoleModelCache = new Map<string, { at: number; result: ConsoleModelResult }>()

  const keepLastGood = (serverID: string, result: UsageResult): UsageResult =>
    withStaleData(result, lastGoodByServer.get(serverID))

  const logResult = (serverID: string, result: UsageResult): void => {
    if (result.state === "ok") {
      loggedState.delete(serverID)
      return
    }
    if (loggedState.get(serverID) === result.state) return
    loggedState.set(serverID, result.state)
    pruneOldest(loggedState, MAX_ENTRIES)
    ctx.log.write("warn", "opencode-go usage unavailable", {
      server: serverID,
      state: result.state,
    })
  }

  const readAuthChoice = async (): Promise<CredentialChoice | undefined> => {
    const file = authFilePath()
    if (!file) return undefined
    try {
      return readAuthFile(JSON.parse(await readFile(file, "utf8")))
    } catch {
      return undefined
    }
  }

  const fetchConsoleLimits = async (endpoint: ServerEndpoint): Promise<UsageData | null> => {
    try {
      const response = await fetch(new URL("/api/experimental/usage/limits", endpoint.url), {
        headers: endpoint.headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) return null
      return parseUsageLimits(await response.json(), Date.now())
    } catch {
      return null
    }
  }

  const readCredentialEntries = async (endpoint: ServerEndpoint): Promise<unknown[] | null> => {
    try {
      const response = await fetch(new URL("/api/credential", endpoint.url), {
        headers: endpoint.headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) return null
      const body = (await response.json()) as { data?: unknown }
      return Array.isArray(body.data) ? body.data : null
    } catch {
      return null
    }
  }

  const fetchConsoleModels = async (
    endpoint: ServerEndpoint,
    source: "server" | "desktop",
  ): Promise<ConsoleModelResult> => {
    const entries = await readCredentialEntries(endpoint)
    if (!entries) {
      return {
        state: "error",
        message: "Couldn't read the signed-in Console connection.",
      }
    }

    const console = selectConsoleCredential(entries)
    if (!console) {
      return {
        state: "error",
        message: "Sign in to OpenCode Console to load per-model Console costs.",
      }
    }

    try {
      const base = console.server.replace(/\/+$/, "")
      const response = await fetch(`${base}/api/usage/models?range=30d&pageSize=100`, {
        headers: {
          Authorization: `Bearer ${console.access}`,
          "x-org-id": console.orgID,
          Accept: "application/json",
          "User-Agent": "opencode-go-usage/0.1.0",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        return {
          state: "error",
          message: `Console model usage is unavailable (HTTP ${response.status}).`,
        }
      }

      const models = parseConsoleModels(await response.json())
      if (models.length === 0) {
        return {
          state: "error",
          message: "Console returned no OpenCode Go model usage.",
        }
      }

      const totalCost = models.reduce((total, model) => total + model.cost, 0)
      return { state: "ok", data: { models, range: "30d", totalCost, source } }
    } catch {
      return {
        state: "error",
        message: "Console model usage couldn't be loaded.",
      }
    }
  }

  ctx.provide(UsageIpc, {
    async get(input): Promise<UsageResult> {
      const serverID = input.server ?? "sidecar"
      const respond = (result: UsageResult): UsageResult => {
        logResult(serverID, result)
        return result
      }

      const endpoint = ctx.serverEndpoints.get(serverID)
      if (!endpoint) {
        return respond(
          keepLastGood(serverID, {
            state: "unavailable",
            message: "The OpenCode server isn't ready.",
          }),
        )
      }

      const envKey = process.env.OPENCODE_GO_API_KEY?.trim()

      if (!envKey) {
        const consoleKey = cacheKey(serverID, "console")
        const cachedConsole = cache.get(consoleKey)
        if (
          !input.force &&
          cachedConsole &&
          Date.now() - cachedConsole.at < cacheTtl(cachedConsole.result)
        ) {
          return respond(cachedConsole.result)
        }

        const consoleData = await fetchConsoleLimits(endpoint)
        if (consoleData) {
          const result: UsageResult = { state: "ok", data: consoleData }
          lastGoodByServer.set(serverID, consoleData)
          pruneOldest(lastGoodByServer, MAX_ENTRIES)
          cache.set(consoleKey, { at: Date.now(), result, lastGood: consoleData })
          pruneOldest(cache, MAX_ENTRIES)
          return respond(result)
        }
      }

      let choice: CredentialChoice | undefined

      if (envKey) {
        choice = {
          kind: "key",
          key: envKey,
          credentialID: "env",
          source: "env",
        }
      } else {
        try {
          const response = await fetch(new URL("/api/credential", endpoint.url), {
            headers: endpoint.headers,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          })
          if (!response.ok) throw new Error(`credential endpoint ${response.status}`)
          const body = (await response.json()) as { data?: unknown }
          if (!Array.isArray(body.data)) throw new Error("invalid credential response")
          choice = selectGoCredential(body.data)
        } catch {
          if (serverID !== "sidecar") {
            return respond(
              keepLastGood(serverID, {
                state: "unavailable",
                message: "Couldn't check the remote OpenCode connection.",
              }),
            )
          }

          const fallback = await readAuthChoice()
          if (!fallback) {
            return respond(
              keepLastGood(serverID, {
                state: "unavailable",
                message: "Couldn't check your OpenCode connection.",
              }),
            )
          }
          choice = fallback
        }
      }

      if (choice?.kind === "none" && serverID === "sidecar") {
        const fallback = await readAuthChoice()
        if (fallback && fallback.kind !== "none") choice = fallback
      }

      if (!choice) {
        return respond(
          keepLastGood(serverID, {
            state: "unavailable",
            message: "Couldn't check your OpenCode connection.",
          }),
        )
      }
      if (choice.kind === "console-only") return respond({ state: "console-only" })
      if (choice.kind === "none") return respond({ state: "signed-out" })

      const credentialID =
        choice.source === "credential"
          ? choice.credentialID
          : `${choice.source}:${hashKey(choice.key)}`
      const key = cacheKey(serverID, credentialID)
      const cached = cache.get(key)
      if (!input.force && cached && Date.now() - cached.at < cacheTtl(cached.result)) {
        return respond(cached.result)
      }

      const pending = inFlight.get(key)
      if (pending) return respond(await pending)

      const request = (async () => {
        const result = withStaleData(await requestUsage(choice.key), cached?.lastGood)
        if (result.state === "ok") {
          lastGoodByServer.set(serverID, result.data)
          pruneOldest(lastGoodByServer, MAX_ENTRIES)
        }
        const lastGood = dataOf(result) ?? cached?.lastGood
        cache.set(key, { at: Date.now(), result, lastGood })
        pruneOldest(cache, MAX_ENTRIES)
        return result
      })()

      inFlight.set(key, request)
      void request.finally(() => inFlight.delete(key))
      return respond(await request)
    },

    async consoleModels(input): Promise<ConsoleModelResult> {
      const serverID = input.server ?? "sidecar"
      const cached = consoleModelCache.get(serverID)
      if (!input.force && cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) {
        return cached.result
      }

      const candidates: Array<{
        id: string
        endpoint: ServerEndpoint
        source: "server" | "desktop"
      }> = []
      const target = ctx.serverEndpoints.get(serverID)
      if (target) {
        candidates.push({ id: serverID, endpoint: target, source: "server" })
      }
      if (serverID !== "sidecar") {
        const desktop = ctx.serverEndpoints.get("sidecar")
        if (desktop) {
          candidates.push({ id: "sidecar", endpoint: desktop, source: "desktop" })
        }
      }

      if (candidates.length === 0) {
        return {
          state: "error",
          message: "The OpenCode server isn't ready.",
        }
      }

      let lastError: Extract<ConsoleModelResult, { state: "error" }> | undefined
      for (const candidate of candidates) {
        const result = await fetchConsoleModels(candidate.endpoint, candidate.source)
        if (result.state === "ok") {
          if (candidate.source === "desktop") {
            ctx.log.write("info", "opencode-go console models using this desktop", {
              server: serverID,
            })
          }
          consoleModelCache.set(serverID, { at: Date.now(), result })
          pruneOldest(consoleModelCache, MAX_ENTRIES)
          return result
        }
        lastError = result
      }

      const failure =
        lastError ?? { state: "error" as const, message: "Console model usage is unavailable." }
      ctx.log.write("warn", "opencode-go console models unavailable", {
        server: serverID,
        message: failure.message,
      })
      return failure
    },
  })
}
