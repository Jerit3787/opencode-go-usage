export type CredentialEntry = {
  id: string
  integrationID: string
  label: string
  active: boolean
  value: { type: string; key?: string }
}

export type CredentialChoice =
  | { kind: "key"; key: string; credentialID: string; source: "credential" | "auth" | "env" }
  | { kind: "console-only"; credentialID: string }
  | { kind: "none" }

export type ConsoleCredential = {
  access: string
  orgID: string
  server: string
  orgName?: string
  credentialID: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function selectGoCredential(entries: unknown): CredentialChoice {
  if (!Array.isArray(entries)) return { kind: "none" }

  let consoleOnly: string | undefined

  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      entry.integrationID !== "opencode-go" ||
      entry.active !== true ||
      !isRecord(entry.value)
    ) {
      continue
    }

    const credentialID = String(entry.id ?? "unknown")
    if (
      entry.value.type === "key" &&
      typeof entry.value.key === "string" &&
      entry.value.key.length > 0
    ) {
      return {
        kind: "key",
        key: entry.value.key,
        credentialID,
        source: "credential",
      }
    }

    consoleOnly ??= credentialID
  }

  if (consoleOnly) return { kind: "console-only", credentialID: consoleOnly }
  return { kind: "none" }
}

export function selectConsoleCredential(entries: unknown): ConsoleCredential | undefined {
  if (!Array.isArray(entries)) return undefined

  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      entry.integrationID !== "opencode" ||
      entry.active !== true ||
      !isRecord(entry.value)
    ) {
      continue
    }

    const value = entry.value
    if (
      value.type !== "oauth" ||
      typeof value.access !== "string" ||
      value.access.length === 0
    ) {
      continue
    }

    const metadata = isRecord(value.metadata) ? value.metadata : {}
    if (typeof metadata.orgID !== "string" || metadata.orgID.length === 0) continue

    return {
      access: value.access,
      orgID: metadata.orgID,
      server:
        typeof metadata.server === "string" && metadata.server.length > 0
          ? metadata.server
          : "https://opencode.ai/console",
      orgName:
        typeof metadata.orgName === "string" && metadata.orgName.length > 0
          ? metadata.orgName
          : undefined,
      credentialID: String(entry.id ?? "unknown"),
    }
  }

  return undefined
}

export function readAuthFile(body: unknown): CredentialChoice {
  if (!isRecord(body)) return { kind: "none" }
  const entry = body["opencode-go"]
  if (!isRecord(entry)) return { kind: "none" }

  if (entry.type === "key") {
    if (typeof entry.key === "string" && entry.key.length > 0) {
      return { kind: "key", key: entry.key, credentialID: "auth.json", source: "auth" }
    }
    return { kind: "none" }
  }

  if (typeof entry.type === "string") {
    return { kind: "console-only", credentialID: "auth.json" }
  }

  return { kind: "none" }
}
