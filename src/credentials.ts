export type CredentialEntry = {
  id: string
  integrationID: string
  label: string
  active: boolean
  value: { type: string; key?: string }
}

export type CredentialChoice =
  | { kind: "key"; key: string; credentialID: string }
  | { kind: "console-only"; credentialID: string }
  | { kind: "none" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function selectGoCredential(entries: CredentialEntry[]): CredentialChoice {
  const active = entries.filter((entry) => entry.integrationID === "opencode-go" && entry.active)

  const keyed = active.find(
    (entry) =>
      entry.value.type === "key" &&
      typeof entry.value.key === "string" &&
      entry.value.key.length > 0,
  )
  if (keyed) {
    return { kind: "key", key: keyed.value.key!, credentialID: keyed.id }
  }

  const consoleEntry = active.find((entry) => entry.value.type !== "key")
  if (consoleEntry) {
    return { kind: "console-only", credentialID: consoleEntry.id }
  }

  return { kind: "none" }
}

export function readAuthFile(body: unknown): CredentialChoice {
  if (!isRecord(body)) return { kind: "none" }
  const entry = body["opencode-go"]
  if (!isRecord(entry)) return { kind: "none" }
  if (entry.type !== "key" || typeof entry.key !== "string" || entry.key.length === 0) {
    return { kind: "none" }
  }
  return { kind: "key", key: entry.key, credentialID: "auth.json" }
}
