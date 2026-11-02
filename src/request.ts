import { parseUsageResponse, type UsageResult } from "./usage"

export const USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
export const USER_AGENT = "opencode-go-usage/0.1.0"

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export async function requestUsage(
  key: string,
  fetchImpl: FetchLike = fetch,
): Promise<UsageResult> {
  try {
    const response = await fetchImpl(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${key}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    })

    if (response.status === 401) {
      return { state: "rejected", message: "OpenCode Go rejected the stored key." }
    }

    if (response.status === 403) {
      const body = await response.text().catch(() => "")
      if (/cloudflare|1010/i.test(body)) {
        return { state: "error", message: "OpenCode couldn't reach the usage service." }
      }
      return { state: "no-plan", message: "This key has no OpenCode Go allowance." }
    }

    if (!response.ok) {
      return {
        state: "error",
        message: `OpenCode usage returned HTTP ${response.status}.`,
      }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { state: "error", message: "OpenCode usage returned an unexpected response." }
    }

    const data = parseUsageResponse(body, Date.now())
    if (!data) {
      return { state: "error", message: "OpenCode usage returned an unexpected response." }
    }

    return { state: "ok", data }
  } catch {
    return { state: "error", message: "OpenCode usage couldn't be reached." }
  }
}
