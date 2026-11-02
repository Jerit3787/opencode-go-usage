import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import {
  readAuthFile,
  selectGoCredential,
  type CredentialChoice,
  type CredentialEntry,
} from "./credentials"
import { requestUsage } from "./request"
import {
  cacheKey,
  cacheTtl,
  dataOf,
  withStaleData,
  type UsageData,
  type UsageResult,
} from "./usage"

function authFilePath(): string | undefined {
  if (process.platform === "win32") return undefined
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "auth.json")
}

export const main: Plugin.MainSetup = (ctx) => {
  const cache = new Map<string, { at: number; result: UsageResult; lastGood?: UsageData }>()

  ctx.provide(UsageIpc, {
    async get(input): Promise<UsageResult> {
      const serverID = input.server ?? "sidecar"
      const endpoint = ctx.serverEndpoints.get(serverID)
      if (!endpoint) {
        return { state: "unavailable", message: "The OpenCode server isn't ready." }
      }

      let choice: CredentialChoice
      try {
        const response = await fetch(new URL("/api/credential", endpoint.url), {
          headers: endpoint.headers,
        })
        if (!response.ok) throw new Error(`credential endpoint ${response.status}`)
        const body = (await response.json()) as { data?: CredentialEntry[] }
        choice = selectGoCredential(body.data ?? [])
      } catch {
        try {
          const file = authFilePath()
          choice = file
            ? readAuthFile(JSON.parse(await readFile(file, "utf8")))
            : { kind: "none" }
        } catch {
          return {
            state: "unavailable",
            message: "Couldn't check your OpenCode connection.",
          }
        }
      }

      if (choice.kind === "console-only") return { state: "console-only" }
      if (choice.kind === "none") return { state: "signed-out" }

      const key = cacheKey(serverID, choice.credentialID)
      const cached = cache.get(key)
      if (!input.force && cached && Date.now() - cached.at < cacheTtl(cached.result)) {
        return cached.result
      }

      const result = withStaleData(await requestUsage(choice.key), cached?.lastGood)
      const lastGood = dataOf(result) ?? cached?.lastGood
      cache.set(key, { at: Date.now(), result, lastGood })
      return result
    },
  })
}
