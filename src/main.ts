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
  withStaleData,
  type UsageData,
  type UsageResult,
} from "./usage"

const FETCH_TIMEOUT_MS = 10_000

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

  const keepLastGood = (serverID: string, result: UsageResult): UsageResult =>
    withStaleData(result, lastGoodByServer.get(serverID))

  ctx.provide(UsageIpc, {
    async get(input): Promise<UsageResult> {
      const serverID = input.server ?? "sidecar"
      const endpoint = ctx.serverEndpoints.get(serverID)
      if (!endpoint) {
        return keepLastGood(serverID, {
          state: "unavailable",
          message: "The OpenCode server isn't ready.",
        })
      }

      let choice: CredentialChoice | undefined
      const envKey = process.env.OPENCODE_GO_API_KEY?.trim()

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
            return keepLastGood(serverID, {
              state: "unavailable",
              message: "Couldn't check the remote OpenCode connection.",
            })
          }

          const file = authFilePath()
          if (!file) {
            return keepLastGood(serverID, {
              state: "unavailable",
              message: "Couldn't check your OpenCode connection.",
            })
          }

          try {
            choice = readAuthFile(JSON.parse(await readFile(file, "utf8")))
          } catch {
            return keepLastGood(serverID, {
              state: "unavailable",
              message: "Couldn't check your OpenCode connection.",
            })
          }
        }
      }

      if (!choice) {
        return keepLastGood(serverID, {
          state: "unavailable",
          message: "Couldn't check your OpenCode connection.",
        })
      }
      if (choice.kind === "console-only") return { state: "console-only" }
      if (choice.kind === "none") return { state: "signed-out" }

      const credentialID =
        choice.source === "credential"
          ? choice.credentialID
          : `${choice.source}:${hashKey(choice.key)}`
      const key = cacheKey(serverID, credentialID)
      const cached = cache.get(key)
      if (!input.force && cached && Date.now() - cached.at < cacheTtl(cached.result)) {
        return cached.result
      }

      const pending = inFlight.get(key)
      if (pending) return pending

      const request = (async () => {
        const result = withStaleData(await requestUsage(choice.key), cached?.lastGood)
        if (result.state === "ok") lastGoodByServer.set(serverID, result.data)
        const lastGood = dataOf(result) ?? cached?.lastGood
        cache.set(key, { at: Date.now(), result, lastGood })
        return result
      })()

      inFlight.set(key, request)
      void request.finally(() => inFlight.delete(key))
      return request
    },
  })
}
