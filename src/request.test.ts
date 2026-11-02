import { expect, it, vi } from "vitest"
import { requestUsage, USAGE_URL, USER_AGENT } from "./request"

const okBody = {
  usage: {
    rolling: { status: "ok", percent: 27, resetsAt: "2026-11-02T18:40:00.000Z" },
    weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
    monthly: { status: "ok", percent: 78, resetsAt: "2026-11-22T04:08:19.000Z" },
  },
}

it("returns parsed data and sends the required headers", async () => {
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toBe(USAGE_URL)
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT)
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer oc_sk_secret")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    return new Response(JSON.stringify(okBody), { status: 200 })
  })
  const result = await requestUsage("oc_sk_secret", fetchImpl)
  expect(result.state).toBe("ok")
  expect(JSON.stringify(result)).not.toContain("oc_sk_secret")
})

it("maps 401 to rejected and plain 403 to no-plan", async () => {
  expect(
    (await requestUsage("oc_sk_secret", async () => new Response("{}", { status: 401 }))).state,
  ).toBe("rejected")
  expect(
    (
      await requestUsage(
        "oc_sk_secret",
        async () => new Response('{"error":"no plan"}', { status: 403 }),
      )
    ).state,
  ).toBe("no-plan")
})

it("maps a Cloudflare 403 to a network error", async () => {
  const result = await requestUsage(
    "oc_sk_secret",
    async () => new Response("<html>cloudflare error 1010</html>", { status: 403 }),
  )
  expect(result.state).toBe("error")

  const html = await requestUsage(
    "oc_sk_secret",
    async () =>
      new Response("", { status: 403, headers: { "content-type": "text/html; charset=utf-8" } }),
  )
  expect(html.state).toBe("error")
})

it("maps network failures and bad JSON to errors without the key", async () => {
  const offline = await requestUsage("oc_sk_secret", async () => {
    throw new Error("offline")
  })
  expect(offline.state).toBe("error")
  expect(JSON.stringify(offline)).not.toContain("oc_sk_secret")
  const bad = await requestUsage("oc_sk_secret", async () => new Response("not json", { status: 200 }))
  expect(bad.state).toBe("error")
})
