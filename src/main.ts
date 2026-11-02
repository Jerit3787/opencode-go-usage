import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import { readAuthFile, selectGoCredential, type CredentialChoice } from "./credentials"
import { requestUsage } from "./request"
import {
  cacheKey,
  cacheTtl,
  dataOf,
  parseUsageLimits,
  pruneOldest,
  withStaleData,
  type UsageData,
  type UsageResult,
} from "./usage"

const FETCH_TIMEOUT_MS = 10_000
const MAX_ENTRIES = 32

function authFilePath(): string | undefined {
  if (process.platform === "win32") return undefined
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "auth.json")
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16)
}

export const main: Plugin.MainSetup = (ctx) => {
  const cache = new Map<string, { at: number; result: UsageResult; lastGood?: UsageData }>()
  const lastGoodByServer = new Map<string, UsageData>()
  const inFlight = new Map<string, Promise<UsageResult>>()
  const loggedState = new Map<string, string>()

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

  const fetchConsoleLimits = async (endpoint: {
    url: string
    headers: Readonly<Record<string, string>>
  }): Promise<UsageData | null> => {
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
  })
}
