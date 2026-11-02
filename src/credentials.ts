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
