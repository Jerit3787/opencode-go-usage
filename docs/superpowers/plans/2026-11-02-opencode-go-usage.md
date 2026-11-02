# OpenCode Go Usage Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude-style OpenCode Go usage viewer to OpenCode Desktop: a live circular meter in the composer pill row, a popover card with 5-hour/weekly/monthly bars and reset times, and a full **Go usage** settings page.

**Architecture:** A GUI-only OpenCode Desktop plugin. The window registers a `ComposerPill` (with a custom popover), a `SettingsPage`, and a `Command`. The main process resolves the active `opencode-go` credential through the app's server endpoint, calls `https://opencode.ai/zen/go/v1/usage`, caches the sanitized result, and exposes it to the window over one typed Ipc. The API key never leaves main.

**Tech Stack:** TypeScript, SolidJS, `@opencode/plugin` 2.2.5 GUI SDK, Vite 7 + `vite-plugin-solid`, Vitest, Effect Schema.

**Spec:** `opencode-usage/docs/superpowers/specs/2026-11-02-opencode-go-usage-design.md`

## Global Constraints

- Target OpenCode Desktop 2.2.5 and `@opencode/plugin` 2.2.5 exactly.
- GUI-only package. No server part, no TUI part.
- Go usage endpoint: `GET https://opencode.ai/zen/go/v1/usage`, `Authorization: Bearer <key>`, `User-Agent: opencode-go-usage/0.1.0`.
- Percentages are used, not remaining. `rolling` is the 5-hour window.
- Never return, log, store, or bundle the API key. The main process may use it only for the request.
- Poll every 60 seconds. Cache success for 60 seconds and failures for 45 seconds, keyed by server id + credential id.
- Manual refresh/retry bypasses both caches with `force: true`.
- Use the app's `--v2-*` theme variables for colors. English copy only.
- v1 is built and tested on macOS. The sidecar credential path is platform-independent; `auth.json` fallback is macOS/Linux only.
- No dollar estimates. No notifications. No Console budget rendering.

## Review Focus

- **Host pill markup changes after an app update.** The ring must disappear gracefully while the text percentage remains; the pill must still be useful.
- **Wrong account or server reading.** A cached result must never be shown after switching servers or credentials; cache keying and selection must be tested.
- **403 ambiguity.** A plain 403 means no Go allowance and points to Console; a Cloudflare-style 403 is a network error and retries. Neither loops the user through reconnect.
- **Network failure.** The UI must keep the last good reading, mark it stale, and never show a confident zero.
- **Key leakage.** The Ipc result, errors, built bundle, and logs must never contain the key.

---

### Task 1: Package scaffold and pure usage model

**Files:**
- Create: `opencode-usage/package.json`
- Create: `opencode-usage/tsconfig.json`
- Create: `opencode-usage/vitest.config.ts`
- Create: `opencode-usage/.gitignore`
- Create: `opencode-usage/src/usage.ts`
- Test: `opencode-usage/src/usage.test.ts`

**Interfaces:**
- Produces:
  - `WINDOW_KEYS = ["rolling", "weekly", "monthly"] as const`
  - `type WindowKey`, `type UsageWindow = { percent: number; limited: boolean; resetsAt: number }`
  - `type UsageData = { windows: Record<WindowKey, UsageWindow>; updatedAt: number; stale: boolean; error?: string }`
  - `type UsageResult = { state: "ok"; data: UsageData } | { state: "signed-out" } | { state: "console-only" } | { state: "unavailable"; message: string; data?: UsageData } | { state: "rejected"; message: string } | { state: "no-plan"; message: string; data?: UsageData } | { state: "error"; message: string; data?: UsageData }`
  - `clampPercent(value: number): number`
  - `parseUsageResponse(body: unknown, now: number): UsageData | null`
  - `tightestWindow(data: UsageData): { key: WindowKey; window: UsageWindow }`
  - `windowShortLabel(key: WindowKey): "5h" | "wk" | "mo"`
  - `usageTone(percent: number, limited: boolean): "none" | "warning" | "danger"`
  - `usageColor(tone: "none" | "warning" | "danger"): string`
  - `formatPercent(percent: number): string`
  - `formatReset(resetsAt: number, now: number, options?: { locale?: string; timeZone?: string }): string`
  - `formatUpdated(updatedAt: number, now: number, options?: { locale?: string; timeZone?: string }): string`
  - `dataOf(result: UsageResult | undefined): UsageData | undefined`
  - `pillView(result: UsageResult | undefined): { label: string; tone?: "warning" | "danger" }`
  - `withStaleData(result: UsageResult, lastGood: UsageData | undefined): UsageResult`
  - `cacheKey(server: string | undefined, credentialID: string): string`
  - `cacheTtl(result: UsageResult): number`
  - `statusCopy(result: UsageResult | undefined): { title: string; body: string; action: "connect" | "console" | "usage" | "retry" | "none" }`

- [ ] **Step 1: Create the package scaffold and the failing tests**

`package.json`:

```json
{
  "name": "opencode-go-usage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./gui-experimental": "./dist/gui-experimental.cjs"
  },
  "files": ["dist"],
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@opencode/plugin": "2.2.5"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "solid-js": "^1.9.0",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vite-plugin-solid": "^2.11.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"],
    "verbatimModuleSyntax": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { environment: "node" },
})
```

`.gitignore`:

```text
node_modules/
dist/
.DS_Store
```

Write `src/usage.test.ts` with these cases:

```ts
import { describe, expect, it } from "vitest"
import {
  cacheKey, cacheTtl, clampPercent, dataOf, formatPercent, formatReset, formatUpdated,
  parseUsageResponse, pillView, statusCopy, tightestWindow, usageTone, withStaleData,
} from "./usage"

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0)

const body = {
  usage: {
    rolling: { status: "ok", percent: 27, resetsAt: "2026-11-02T18:40:00.000Z" },
    weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
    monthly: { status: "ok", percent: 78, resetsAt: "2026-11-22T04:08:19.000Z" },
  },
}

it("parses the live response shape", () => {
  const data = parseUsageResponse(body, NOW)
  expect(data).not.toBeNull()
  expect(data!.windows.rolling).toEqual({ percent: 27, limited: false, resetsAt: Date.UTC(2026, 10, 2, 18, 40) })
  expect(data!.windows.weekly.percent).toBe(10)
  expect(data!.windows.monthly.percent).toBe(78)
  expect(data!.updatedAt).toBe(NOW)
  expect(data!.stale).toBe(false)
})

it("rejects a response missing a window or a numeric percent", () => {
  expect(parseUsageResponse({ usage: { rolling: body.usage.rolling, weekly: body.usage.weekly } }, NOW)).toBeNull()
  expect(parseUsageResponse({ usage: { ...body.usage, monthly: { percent: "78" } } }, NOW)).toBeNull()
})

it("clamps percentages and treats non-ok status as limited", () => {
  expect(clampPercent(120)).toBe(100)
  expect(clampPercent(-5)).toBe(0)
  const data = parseUsageResponse({ usage: { ...body.usage, rolling: { status: "limited", percent: 100, resetsAt: body.usage.rolling.resetsAt } } }, NOW)!
  expect(data.windows.rolling.limited).toBe(true)
})

it("picks the tightest window and keeps rolling on a tie", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(tightestWindow(data).key).toBe("monthly")
  const tie = parseUsageResponse({ usage: {
    rolling: { status: "ok", percent: 50, resetsAt: body.usage.rolling.resetsAt },
    weekly: { status: "ok", percent: 50, resetsAt: body.usage.weekly.resetsAt },
    monthly: { status: "ok", percent: 10, resetsAt: body.usage.monthly.resetsAt },
  } }, NOW)!
  expect(tightestWindow(tie).key).toBe("rolling")
})

it("maps tones at the exact thresholds", () => {
  expect(usageTone(69, false)).toBe("none")
  expect(usageTone(70, false)).toBe("warning")
  expect(usageTone(89, false)).toBe("warning")
  expect(usageTone(90, false)).toBe("danger")
  expect(usageTone(10, true)).toBe("danger")
})

it("formats reset times and updated times in UTC", () => {
  expect(formatReset(Date.UTC(2026, 10, 2, 18, 40), NOW, { timeZone: "UTC" })).toBe("Resets at 6:40 PM")
  expect(formatReset(Date.UTC(2026, 10, 8, 18, 0), NOW, { timeZone: "UTC" })).toBe("Resets Sun 6:00 PM")
  expect(formatReset(Date.UTC(2026, 10, 22, 4, 8), NOW, { timeZone: "UTC" })).toBe("Resets 22 Nov 4:08 AM")
  expect(formatReset(0, NOW, { timeZone: "UTC" })).toBe("Reset time unavailable")
  expect(formatUpdated(NOW - 30_000, NOW, { timeZone: "UTC" })).toBe("Updated just now")
  expect(formatUpdated(NOW - 5 * 60_000, NOW, { timeZone: "UTC" })).toBe("Updated 5m ago")
  expect(formatUpdated(NOW - 2 * 60 * 60_000, NOW, { timeZone: "UTC" })).toBe("Updated 10:00 AM")
})

it("builds the pill label and keeps data on errors", () => {
  const data = parseUsageResponse(body, NOW)!
  expect(pillView({ state: "ok", data })).toEqual({ label: "mo 78%", tone: undefined })
  expect(pillView({ state: "rejected", message: "no" })).toEqual({ label: "Go usage", tone: "danger" })
  expect(pillView({ state: "error", message: "no" })).toEqual({ label: "Go usage", tone: "warning" })
  const stale = withStaleData({ state: "error", message: "offline" }, data)
  expect(dataOf(stale)?.stale).toBe(true)
  expect(dataOf(stale)?.error).toBe("offline")
  expect(dataOf({ state: "signed-out" })).toBeUndefined()
})

it("maps status copy and cache values", () => {
  expect(statusCopy({ state: "signed-out" }).action).toBe("connect")
  expect(statusCopy({ state: "console-only" }).action).toBe("usage")
  expect(statusCopy({ state: "no-plan", message: "no" }).action).toBe("console")
  expect(statusCopy({ state: "unavailable", message: "no" }).action).toBe("retry")
  expect(statusCopy({ state: "error", message: "no" }).action).toBe("retry")
  expect(cacheKey(undefined, "cred_1")).toBe("sidecar:cred_1")
  expect(cacheKey("remote", "cred_1")).toBe("remote:cred_1")
  expect(cacheTtl({ state: "ok", data: parseUsageResponse(body, NOW)! })).toBe(60_000)
  expect(cacheTtl({ state: "error", message: "no" })).toBe(45_000)
  expect(formatPercent(27.6)).toBe("28%")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd opencode-usage && npm install && npm test`
Expected: FAIL because `./usage` has no implementation.

- [ ] **Step 3: Implement `src/usage.ts`**

Implement the exact signatures from Interfaces. Requirements:

- `parseUsageResponse` requires all three windows and a finite numeric `percent`; otherwise returns `null`. Clamp percent 0–100. `limited` is true when `entry.limited === true` or `entry.status` is present and not `"ok"`. Parse `resetsAt` with `Date.parse`; invalid/missing becomes `0`. Set `updatedAt = now`, `stale = false`.
- `tightestWindow` reduces in `WINDOW_KEYS` order and keeps the first on a tie.
- `usageTone`: `danger` when `limited` or `percent >= 90`; `warning` when `percent >= 70`; else `none`.
- `usageColor`: `none` → `var(--v2-text-text-accent)`, `warning` → `var(--v2-state-fg-warning)`, `danger` → `var(--v2-state-fg-danger)`.
- `formatReset`:
  - `resetsAt <= 0` → `"Reset time unavailable"`.
  - Same local day → `"Resets at 6:40 PM"`.
  - Within 7 days → `"Resets Sun 6:00 PM"`.
  - Otherwise → `"Resets 22 Nov 4:08 AM"`.
  - Use `Intl.DateTimeFormat.formatToParts` so the exact strings above are produced; default locale `"en-US"` and the local timezone when no options are passed.
- `formatUpdated`: `< 60s` → `"Updated just now"`; `< 60m` → `"Updated 5m ago"`; otherwise `"Updated 10:00 AM"` with the local time.
- `pillView`: with data, `{ label: `${short} ${formatPercent(tightest.percent)}`, tone: tone === "none" ? undefined : tone }`; without data, `{ label: "Go usage", tone: rejected ? "danger" : error/unavailable ? "warning" : undefined }`.
- `withStaleData`: for `error`, `unavailable`, or `no-plan` with a `lastGood`, return the same result with `data: { ...lastGood, stale: true, error: result.message }`; otherwise return the result unchanged.
- `cacheKey`: `${server ?? "sidecar"}:${credentialID}`.
- `cacheTtl`: 60_000 for `ok`, 45_000 otherwise.
- `statusCopy` exact copy:
  - signed-out: `"OpenCode Go isn't connected"` / `"Connect OpenCode Go with an API key to see your usage."` / `connect`
  - console-only: `"Connected through Console"` / `"Open the built-in Usage page to see Console budgets and Go usage."` / `usage`
  - rejected: `"OpenCode Go rejected the stored key"` / `"Reconnect OpenCode Go to keep tracking usage."` / `connect`
  - no-plan: `"No OpenCode Go allowance"` / `"This key is valid, but it has no Go plan. Check your plan in Console."` / `console`
  - unavailable: `"Couldn't check your OpenCode connection"` / `"The OpenCode server isn't reachable. Retry in a moment."` / `retry`
  - error: `"Usage couldn't be loaded"` / `"OpenCode returned an error. Retry, or check Console."` / `retry`
  - ok: `""` / `""` / `none`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd opencode-usage && npm test`
Expected: PASS.

- [ ] **Step 5: Initialize the repo and commit**

```bash
cd opencode-usage
git init
git add package.json tsconfig.json vitest.config.ts .gitignore src/usage.ts src/usage.test.ts
git commit -m "feat: add Go usage model and parsing"
```

---

### Task 2: Credential selection and usage request

**Files:**
- Create: `opencode-usage/src/credentials.ts`
- Test: `opencode-usage/src/credentials.test.ts`
- Create: `opencode-usage/src/request.ts`
- Test: `opencode-usage/src/request.test.ts`

**Interfaces:**
- Consumes: `UsageResult`, `parseUsageResponse` from `./usage`.
- Produces:
  - `type CredentialEntry = { id: string; integrationID: string; label: string; active: boolean; value: { type: string; key?: string } }`
  - `type CredentialChoice = { kind: "key"; key: string; credentialID: string } | { kind: "console-only"; credentialID: string } | { kind: "none" }`
  - `selectGoCredential(entries: CredentialEntry[]): CredentialChoice`
  - `readAuthFile(body: unknown): CredentialChoice`
  - `USAGE_URL`, `USER_AGENT`, `type FetchLike`
  - `requestUsage(key: string, fetchImpl?: FetchLike): Promise<UsageResult>`

- [ ] **Step 1: Write the failing tests**

`credentials.test.ts`:

```ts
import { expect, it } from "vitest"
import { readAuthFile, selectGoCredential } from "./credentials"

const key = (id: string, active = true) => ({
  id, integrationID: "opencode-go", label: "OpenCode Go", active,
  value: { type: "key", key: `oc_sk_${id}` },
})

it("selects the first active Go key", () => {
  expect(selectGoCredential([key("a", false), key("b")])).toEqual({ kind: "key", key: "oc_sk_b", credentialID: "b" })
})

it("reports Console-only and none", () => {
  expect(selectGoCredential([{ id: "c", integrationID: "opencode-go", label: "Go", active: true, value: { type: "oauth" } }]))
    .toEqual({ kind: "console-only", credentialID: "c" })
  expect(selectGoCredential([{ ...key("a"), integrationID: "other" }])).toEqual({ kind: "none" })
})

it("reads the auth.json fallback", () => {
  expect(readAuthFile({ "opencode-go": { type: "key", key: "oc_sk_file" } }))
    .toEqual({ kind: "key", key: "oc_sk_file", credentialID: "auth.json" })
  expect(readAuthFile({})).toEqual({ kind: "none" })
})
```

`request.test.ts`:

```ts
import { expect, it, vi } from "vitest"
import { requestUsage, USAGE_URL, USER_AGENT } from "./request"

const okBody = { usage: {
  rolling: { status: "ok", percent: 27, resetsAt: "2026-11-02T18:40:00.000Z" },
  weekly: { status: "ok", percent: 10, resetsAt: "2026-11-08T18:00:00.000Z" },
  monthly: { status: "ok", percent: 78, resetsAt: "2026-11-22T04:08:19.000Z" },
} }

it("returns parsed data and sends the required headers", async () => {
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toBe(USAGE_URL)
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT)
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer oc_sk_secret")
    return new Response(JSON.stringify(okBody), { status: 200 })
  })
  const result = await requestUsage("oc_sk_secret", fetchImpl)
  expect(result.state).toBe("ok")
  expect(JSON.stringify(result)).not.toContain("oc_sk_secret")
})

it("maps 401 to rejected and plain 403 to no-plan", async () => {
  expect((await requestUsage("oc_sk_secret", async () => new Response("{}", { status: 401 }))).state).toBe("rejected")
  expect((await requestUsage("oc_sk_secret", async () => new Response('{"error":"no plan"}', { status: 403 }))).state).toBe("no-plan")
})

it("maps a Cloudflare 403 to a network error", async () => {
  const result = await requestUsage("oc_sk_secret", async () => new Response("<html>cloudflare error 1010</html>", { status: 403 }))
  expect(result.state).toBe("error")
})

it("maps network failures and bad JSON to errors without the key", async () => {
  const offline = await requestUsage("oc_sk_secret", async () => { throw new Error("offline") })
  expect(offline.state).toBe("error")
  expect(JSON.stringify(offline)).not.toContain("oc_sk_secret")
  const bad = await requestUsage("oc_sk_secret", async () => new Response("not json", { status: 200 }))
  expect(bad.state).toBe("error")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd opencode-usage && npm test`
Expected: FAIL because `./credentials` and `./request` do not exist.

- [ ] **Step 3: Implement `credentials.ts` and `request.ts`**

`selectGoCredential`: filter active `opencode-go`; return the first key; else if any non-key active entry exists, return `console-only`; else `none`.

`readAuthFile`: accept `{ "opencode-go": { type: "key", key: string } }`; return `{ kind: "key", key, credentialID: "auth.json" }`; otherwise `none`.

`requestUsage`:

```ts
const response = await fetchImpl(USAGE_URL, {
  headers: { Authorization: `Bearer ${key}`, "User-Agent": USER_AGENT, Accept: "application/json" },
})
```

- 401 → `{ state: "rejected", message: "OpenCode Go rejected the stored key." }`
- 403 → read the body text; if it contains `cloudflare` or `1010` (case-insensitive), return `{ state: "error", message: "OpenCode couldn't reach the usage service." }`; otherwise `{ state: "no-plan", message: "This key has no OpenCode Go allowance." }`
- Other non-OK → `{ state: "error", message: `OpenCode usage returned HTTP ${status}.` }`
- JSON parse + `parseUsageResponse(body, Date.now())`; null → `{ state: "error", message: "OpenCode usage returned an unexpected response." }`
- Catch network errors → `{ state: "error", message: "OpenCode usage couldn't be reached." }`
- Never include the key or raw body in a result.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd opencode-usage && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/credentials.ts src/credentials.test.ts src/request.ts src/request.test.ts
git commit -m "feat: resolve Go credentials and request usage"
```

---

### Task 3: Typed Ipc and main-process cache

**Files:**
- Create: `opencode-usage/src/contract.ts`
- Create: `opencode-usage/src/main.ts`
- Modify: `opencode-usage/src/usage.test.ts` (add cache/stale tests if not already covered)

**Interfaces:**
- Consumes: `UsageResult`, `withStaleData`, `cacheKey`, `cacheTtl` from `./usage`; `selectGoCredential`, `readAuthFile`, `requestUsage` from Tasks 2.
- Produces:
  - `UsageIpc` with id `opencode-go-usage.data`, method `get(input: { server?: string; force?: boolean })`
  - `main: Plugin.MainSetup`

- [ ] **Step 1: Write the contract and main**

`contract.ts`:

```ts
import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

const WindowSchema = Schema.Struct({ percent: Schema.Number, limited: Schema.Boolean, resetsAt: Schema.Number })
const DataSchema = Schema.Struct({
  windows: Schema.Struct({ rolling: WindowSchema, weekly: WindowSchema, monthly: WindowSchema }),
  updatedAt: Schema.Number,
  stale: Schema.Boolean,
  error: Schema.optional(Schema.String),
})
const ResultSchema = Schema.Union(
  Schema.Struct({ state: Schema.Literal("ok"), data: DataSchema }),
  Schema.Struct({ state: Schema.Literal("signed-out") }),
  Schema.Struct({ state: Schema.Literal("console-only") }),
  Schema.Struct({ state: Schema.Literal("unavailable"), message: Schema.String, data: Schema.optional(DataSchema) }),
  Schema.Struct({ state: Schema.Literal("rejected"), message: Schema.String }),
  Schema.Struct({ state: Schema.Literal("no-plan"), message: Schema.String, data: Schema.optional(DataSchema) }),
  Schema.Struct({ state: Schema.Literal("error"), message: Schema.String, data: Schema.optional(DataSchema) }),
)

export const UsageIpc = Ipc.define({
  id: "opencode-go-usage.data",
  methods: {
    get: {
      input: Schema.Struct({ server: Schema.optional(Schema.String), force: Schema.optional(Schema.Boolean) }),
      output: ResultSchema,
    },
  },
})

export type UsageInput = { server?: string; force?: boolean }
```

`main.ts`:

```ts
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin/gui"
import { UsageIpc } from "./contract"
import { readAuthFile, selectGoCredential, type CredentialChoice, type CredentialEntry } from "./credentials"
import { requestUsage } from "./request"
import { cacheKey, cacheTtl, withStaleData, type UsageData, type UsageResult } from "./usage"

export const main: Plugin.MainSetup = (ctx) => {
  const cache = new Map<string, { at: number; result: UsageResult; lastGood?: UsageData }>()

  ctx.provide(UsageIpc, {
    async get(input) {
      const serverID = input.server ?? "sidecar"
      const endpoint = ctx.serverEndpoints.get(serverID)
      if (!endpoint) return { state: "unavailable", message: "The OpenCode server isn't ready." }

      let choice: CredentialChoice
      try {
        const response = await fetch(new URL("/api/credential", endpoint.url), { headers: endpoint.headers })
        if (!response.ok) throw new Error(`credential endpoint ${response.status}`)
        const body = (await response.json()) as { data?: CredentialEntry[] }
        choice = selectGoCredential(body.data ?? [])
      } catch {
        try {
          const file = process.platform === "win32" ? undefined : join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "auth.json")
          choice = file ? readAuthFile(JSON.parse(await readFile(file, "utf8"))) : { kind: "none" }
        } catch {
          return { state: "unavailable", message: "Couldn't check your OpenCode connection." }
        }
      }

      if (choice.kind === "console-only") return { state: "console-only" }
      if (choice.kind === "none") return { state: "signed-out" }

      const key = cacheKey(serverID, choice.credentialID)
      const cached = cache.get(key)
      if (!input.force && cached && Date.now() - cached.at < cacheTtl(cached.result)) return cached.result

      const result = withStaleData(await requestUsage(choice.key), cached?.lastGood)
      const lastGood = result.state === "ok" ? result.data : result.data ?? cached?.lastGood
      cache.set(key, { at: Date.now(), result, lastGood })
      return result
    },
  })
}
```

- [ ] **Step 2: Run the typecheck**

Run: `cd opencode-usage && npm run typecheck`
Expected: PASS. If `Schema.optional` or `Plugin.MainSetup` differs in 2.2.5, adjust to the installed type definitions; do not cast away the error.

- [ ] **Step 3: Run the tests**

Run: `cd opencode-usage && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/contract.ts src/main.ts
git commit -m "feat: add typed usage Ipc and main cache"
```

---

### Task 4: Plugin shell, reactive state, and ring pill

**Files:**
- Create: `opencode-usage/vite.config.ts`
- Create: `opencode-usage/src/state.ts`
- Create: `opencode-usage/src/styles.ts`
- Create: `opencode-usage/src/pill.tsx`
- Create: `opencode-usage/src/gui.tsx`

**Interfaces:**
- Consumes: `UsageIpc`, `UsageInput`; `UsageResult`, `dataOf`, `pillView`, `tightestWindow`, `usageColor`, `clampPercent`; `main`.
- Produces:
  - `type UsageState = { result: Accessor<UsageResult | undefined>; loading: Accessor<boolean>; server: Accessor<string | undefined>; refresh(opts?: { force?: boolean; server?: string }): Promise<void>; openSettings(): void; connect(): void; openBuiltinUsage(): void; openConsole(): void }`
  - `createUsageState(ctx: Context): UsageState`
  - `usageStyles: string`
  - default `Plugin.define({ setup, main })`

- [ ] **Step 1: Create the Vite config**

```ts
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

export default defineConfig({
  plugins: [gui({ entry: "src/gui.tsx", outFile: "dist/gui-experimental.cjs" })],
})
```

- [ ] **Step 2: Implement `state.ts`**

```ts
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
      setResult(await ctx.main(UsageIpc).get({ server: opts.server ?? server(), force: opts.force }))
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
    result, loading, server, refresh,
    openSettings: () => ctx.layout.settings("opencode-go-usage"),
    connect: () => { if (!ctx.commands.run("provider.connect")) ctx.toast.show({ title: "Run /connect to add OpenCode Go.", variant: "error" }) },
    openBuiltinUsage: () => { if (!ctx.commands.run("usage.view")) ctx.system.openExternal("https://opencode.ai/console") },
    openConsole: () => ctx.system.openExternal("https://opencode.ai/console"),
  }
}
```

- [ ] **Step 3: Implement `styles.ts` and `pill.tsx`**

`styles.ts`:

```ts
export const usageStyles = `
:root {
  --oc-go-usage-percent: 0;
  --oc-go-usage-color: var(--v2-text-text-muted);
}
[data-slot="session-plugin-pill"][aria-label="Plan usage limits · Go"]::before {
  content: "";
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 50%;
  background: conic-gradient(
    var(--oc-go-usage-color) calc(var(--oc-go-usage-percent) * 1%),
    var(--v2-border-border-muted, rgba(127, 127, 127, 0.25)) 0
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px));
}
`
```

`pill.tsx`:

```tsx
import type { ComposerPill, Context } from "@opencode/plugin/gui"
import type { UsageState } from "./state"
import { pillView } from "./usage"

export const USAGE_TITLE = "Plan usage limits · Go"

export function usagePill(ctx: Context, state: UsageState): ComposerPill {
  return {
    id: "usage",
    order: 0,
    show: () => {
      const view = pillView(state.result())
      return { label: view.label, title: USAGE_TITLE, tone: view.tone }
    },
    menu: () => <div style={{ padding: "8px" }}>Usage card</div>,
  }
}
```

- [ ] **Step 4: Implement `gui.tsx`**

```tsx
import { createEffect, onCleanup } from "solid-js"
import { ComposerPill, Plugin, Style } from "@opencode/plugin/gui"
import { main } from "./main"
import { usagePill, USAGE_TITLE } from "./pill"
import { createUsageState } from "./state"
import { usageStyles } from "./styles"
import { clampPercent, dataOf, tightestWindow, usageColor, usageTone } from "./usage"

export default Plugin.define({
  setup(ctx) {
    const state = createUsageState(ctx)
    ctx.add(ComposerPill, usagePill(ctx, state))
    ctx.add(Style, usageStyles)

    createEffect(() => {
      const data = dataOf(state.result())
      const root = document.documentElement
      if (!data) {
        root.style.setProperty("--oc-go-usage-percent", "0")
        root.style.setProperty("--oc-go-usage-color", "var(--v2-text-text-muted)")
        return
      }
      const { window } = tightestWindow(data)
      root.style.setProperty("--oc-go-usage-percent", String(clampPercent(window.percent)))
      root.style.setProperty("--oc-go-usage-color", usageColor(usageTone(window.percent, window.limited)))
    })

    onCleanup(() => {
      document.documentElement.style.removeProperty("--oc-go-usage-percent")
      document.documentElement.style.removeProperty("--oc-go-usage-color")
    })
  },
  main,
})
```

- [ ] **Step 5: Build**

Run: `cd opencode-usage && npm run build`
Expected: PASS and `dist/gui-experimental.cjs` exists.

- [ ] **Step 6: Install and verify the ring pill**

Add the absolute path to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugins": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "/Users/danishhakim/Documents/Default Project/opencode-usage"
  ]
}
```

Wait for the app to reload the plugin. Open a session. Expected: a pill in the composer pill row with a 14px ring and a label like `5h 27%` or `mo 78%`; the ring color reflects the tightest window. If the pill shows `Go usage`, check the desktop log for a sanitized error and confirm the Go credential is present.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts src/state.ts src/styles.ts src/pill.tsx src/gui.tsx
git commit -m "feat: add composer ring pill"
```

---

### Task 5: Popover card with meters

**Files:**
- Create: `opencode-usage/src/meter.tsx`
- Create: `opencode-usage/src/card.tsx`
- Modify: `opencode-usage/src/pill.tsx`
- Test: `opencode-usage/src/usage.test.ts` (add any missing pure cases)

**Interfaces:**
- Consumes: `UsageState`; `formatPercent`, `formatReset`, `formatUpdated`, `usageColor`, `usageTone`, `dataOf`, `statusCopy`, `WINDOW_KEYS`.
- Produces:
  - `MeterRow(props: { label: string; window: UsageWindow; now: number; size?: "small" | "large" })`
  - `UsageCard(props: { state: UsageState; ctx: Context; close(): void; onSeeAll(): void })`

- [ ] **Step 1: Implement `meter.tsx`**

`MeterRow` renders:

- A label row: left label, right `formatReset(window.resetsAt, now)` in `var(--v2-text-text-muted)`, then `formatPercent(window.percent)` in the tone color.
- A track: `height: size === "large" ? 6px : 4px`, `background: var(--v2-border-border-muted)`, `border-radius: 999px`.
- A fill: `width: ${clampPercent(window.percent)}%`, same height, `background: usageColor(tone)`, `border-radius: 999px`.
- No `title` attributes; the text carries the information.

- [ ] **Step 2: Implement `card.tsx`**

`UsageCard`:

- On mount, if `dataOf(state.result())` is missing or `updatedAt` is older than 30 seconds, call `state.refresh()` once.
- If data: render three `MeterRow`s with labels `5-hour limit`, `Weekly · all models`, `Monthly`.
- Footer row: `formatUpdated(data.updatedAt, Date.now())` on the left; a text button `See all →` on the right that calls `onSeeAll`.
- If no data: render `statusCopy(state.result())` as title/body plus an action button:
  - `connect` → `state.connect()`
  - `usage` → `state.openBuiltinUsage()`
  - `console` → `state.openConsole()`
  - `retry` → `state.refresh({ force: true })`
- If `state.loading()` and no data, render `ctx.ui.Loader`.
- Keep the card width to the host's `w-80` popover; use `display: grid; gap: 12px; padding: 4px`.

- [ ] **Step 3: Wire the menu in `pill.tsx`**

```tsx
menu: (input) => (
  <UsageCard
    state={state}
    ctx={ctx}
    close={input.close}
    onSeeAll={() => { input.close(); state.openSettings() }}
  />
)
```

- [ ] **Step 4: Build and verify**

Run: `cd opencode-usage && npm run build`
Expected: PASS.

Click the pill in a session. Expected: a card with the host heading **Plan usage limits · Go**, three rows, colored bars, reset times, percentages, last-updated time, and **See all →**. Verify the percentages match `GET /zen/go/v1/usage` for the active key.

- [ ] **Step 5: Commit**

```bash
git add src/meter.tsx src/card.tsx src/pill.tsx
git commit -m "feat: add usage popover card"
```

---

### Task 6: Settings page and command

**Files:**
- Create: `opencode-usage/src/settings.tsx`
- Create: `opencode-usage/src/ring.tsx`
- Modify: `opencode-usage/src/gui.tsx`

**Interfaces:**
- Consumes: `UsageState`; `MeterRow`; `Ring`; `dataOf`, `tightestWindow`, `usageColor`, `usageTone`, `clampPercent`, `formatUpdated`, `statusCopy`.
- Produces:
  - `Ring(props: { percent: number; size: number; stroke: number; color: string; label: string })`
  - `UsageSettings(props: { state: UsageState; ctx: Context })`

- [ ] **Step 1: Implement `ring.tsx`**

SVG ring:

- `radius = (size - stroke) / 2`, `circumference = 2 * Math.PI * radius`.
- Track circle in `var(--v2-border-border-muted)`.
- Progress circle with `stroke-dasharray={circumference}` and `stroke-dashoffset={circumference * (1 - clampPercent(percent) / 100)}`, rotated `-90deg` around the center.
- Center text `label` in `var(--v2-text-text-base)`.
- No animation; it is a status display.

- [ ] **Step 2: Implement `settings.tsx`**

Page layout:

- Header row: 64px `Ring` with the tightest percentage; title **OpenCode Go**; `formatUpdated(data.updatedAt, Date.now())`; a **Refresh** button that calls `state.refresh({ force: true })` and shows `ctx.ui.Loader` while `state.loading()`.
- Three `MeterRow`s with `size="large"` and the same labels as the card.
- Footer row: **View in Console** (`state.openConsole()`), **Open built-in Usage** (`state.openBuiltinUsage()`).
- If no data: render `statusCopy` and the matching action, same as the card.
- Use `display: grid; gap: 20px; max-width: 720px`.
- If the result has `data.stale`, show a muted line `Showing the last reading.` above the meters.

- [ ] **Step 3: Register the page and command in `gui.tsx`**

```tsx
ctx.add(SettingsPage, {
  id: "opencode-go-usage",
  icon: "window-analytics",
  get title() { return "Go usage" },
  entries: [{ id: "usage", title: "Go usage", description: "OpenCode Go limits and reset times", keywords: "usage limits go subscription" }],
  render: () => <UsageSettings state={state} ctx={ctx} />,
})

ctx.add(Command, {
  id: "open",
  title: "OpenCode Go usage",
  description: "See your Go 5-hour, weekly, and monthly limits",
  group: "View",
  run: () => ctx.layout.settings("opencode-go-usage"),
})
```

Import `Command`, `SettingsPage`, and `UsageSettings`.

- [ ] **Step 4: Build and verify**

Run: `cd opencode-usage && npm run build`
Expected: PASS.

Verify:
- Command palette → **OpenCode Go usage** opens the page.
- **See all →** in the card opens the page.
- Refresh updates the timestamp; the values match the endpoint.
- **View in Console** opens `https://opencode.ai/console`.

- [ ] **Step 5: Commit**

```bash
git add src/ring.tsx src/settings.tsx src/gui.tsx
git commit -m "feat: add Go usage settings page"
```

---

### Task 7: Error, stale, and console-only states

**Files:**
- Modify: `opencode-usage/src/card.tsx`
- Modify: `opencode-usage/src/settings.tsx`
- Modify: `opencode-usage/src/state.ts`
- Test: `opencode-usage/src/usage.test.ts` (add any missing status cases)

**Interfaces:**
- Consumes: `statusCopy`, `dataOf`, `withStaleData`.
- Produces: no new public interfaces.

- [ ] **Step 1: Add the missing status tests**

Add cases for every `statusCopy` action and for `pillView` with `console-only`, `no-plan`, `unavailable`, and `stale` data. Run `npm test`; expected PASS after implementation.

- [ ] **Step 2: Render the states in the card and page**

- Signed out: connect action.
- Console-only: built-in Usage action.
- Rejected: connect action.
- No plan: Console action.
- Unavailable: retry action; show the last reading if `data` exists.
- Error: retry action; show the last reading if `data` exists, with `Showing the last reading.` and the stale timestamp.
- Loading: loader only when there is no data; otherwise keep the last data visible and show a small busy state on Refresh.
- All error copy comes from `statusCopy`; no raw response text.

- [ ] **Step 3: Make refresh/retry bypass the cache**

Confirm the card's retry and the page's refresh call `state.refresh({ force: true })`. Confirm the 60s poll calls `state.refresh()` without force.

- [ ] **Step 4: Build and test**

Run: `cd opencode-usage && npm test && npm run typecheck && npm run build`
Expected: PASS.

Manual check: use the card/page with normal data; then stop the network briefly and reopen the card. Expected: last reading remains, marked stale, with retry. Do not edit the stored credential to force a 401.

- [ ] **Step 5: Commit**

```bash
git add src/card.tsx src/settings.tsx src/state.ts src/usage.test.ts
git commit -m "feat: handle usage error and stale states"
```

---

### Task 8: Documentation and final verification

**Files:**
- Create: `opencode-usage/README.md`
- Modify: `opencode-usage/docs/superpowers/specs/2026-11-02-opencode-go-usage-design.md` (mark approved)

- [ ] **Step 1: Write the README**

Include:

- What it shows: Go rolling 5-hour, weekly, monthly percentages and reset times.
- Where it appears: composer pill ring, popover card, **Go usage** settings page.
- Install: build, add the absolute directory to `~/.config/opencode/opencode.jsonc` `plugins`, reload.
- Privacy: the key is read in main, used only for the usage GET, never logged or stored; only percentages/reset times leave the machine.
- Uninstall: remove the config entry.
- Development: `npm install`, `npm test`, `npm run typecheck`, `npm run build`, `npm run watch`.
- Compatibility: OpenCode Desktop 2.2.5+, experimental GUI plugin API.

- [ ] **Step 2: Run the full verification**

```bash
cd opencode-usage
npm test
npm run typecheck
npm run build
test -f dist/gui-experimental.cjs
```

Expected: all pass and the bundle exists.

- [ ] **Step 3: Verify no key material**

```bash
grep -R "oc_sk_" dist src README.md || true
grep -R "oc_sk_" "$HOME/.local/share/opencode/log/opencode.log" | tail -5 || true
```

Expected: no key values in the bundle, source, README, or log. (Test fixtures use `oc_sk_secret` only in tests; the source bundle must not contain it.)

- [ ] **Step 4: Verify the installed plugin**

- `~/.config/opencode/opencode.jsonc` contains the absolute plugin path.
- The app's **Settings › Extensions › Plugins** lists `opencode-go-usage` as active.
- A session shows the ring pill with a live percentage.
- The card and page open and match the endpoint.
- Turning the plugin off removes the pill; turning it back on restores it.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-02-opencode-go-usage-design.md
git commit -m "docs: add usage viewer README"
```

---

## Post-Review Corrections (2026-11-02)

The whole-branch review found wrong-account and stale-state risks that the first pass inherited from this plan. The implementation now differs from the task snippets above in these ways:

- Credential resolution checks `OPENCODE_GO_API_KEY` first and uses a one-way fingerprint for its cache id.
- `auth.json` is a fallback only for the local `sidecar` server; a remote server's credential failure is `unavailable`, never a local account's reading.
- Credential responses must contain an array; malformed responses are `unavailable`, not `signed-out`, and malformed entries are skipped.
- The window state is tagged by server and sequenced with a request generation. Switching servers hides the previous reading immediately, and an older response cannot overwrite a newer one. A request rejection keeps the last reading for that same server.
- The main process keeps last-good data per server for endpoint/credential failures, and the window catch merges last-good data.
- Both fetches have a 10-second abort timeout; concurrent requests for the same server + credential share one in-flight request.
- The success cache is 45 seconds, below the 60-second poll. The card and settings page force a refresh when their reading is older than 30 seconds.
- Stale readings are marked in the pill (`·`) and with a muted ring; `MeterRow` and `Ring` use reactive memos for tone, color, width, and arc.
- Tests now cover remote fallback isolation, invalid credential data, auth-key cache invalidation, env-key resolution, in-flight coalescing, last-good retention, request timeouts, stale pill state, and out-of-order server responses (28 tests).

Deferred minors from the review: same-day weekly/monthly reset copy, “Limit reached” row copy, loader flicker on background refresh, auth-file fallback on a valid empty credential response, cache-map housekeeping, sanitized diagnostics, and the hardcoded README install path.

## Self-Review Notes

- **Spec coverage:** ring pill (Task 4), popover card (Task 5), settings page (Task 6), states (Task 7), credential/main/cache (Tasks 2–3), tests/docs (Tasks 1, 8).
- **Type consistency:** `UsageResult`, `UsageData`, `WindowKey`, `UsageState`, `UsageIpc` names are used consistently across tasks.
- **Review Focus tests:** host markup fallback is a manual check in Task 4; wrong-account cache is covered by `cacheKey`/`selectGoCredential` tests; 403 mapping is covered in Task 2; network stale behavior is covered by `withStaleData`/`statusCopy` tests and the manual check in Task 7; key leakage is covered by `requestUsage` tests and Task 8 grep.
- **Proportion:** UI tasks specify structure and exact copy; they do not transcribe full component bodies.
