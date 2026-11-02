import { expect, it } from "vitest"
import { readAuthFile, selectGoCredential } from "./credentials"

const key = (id: string, active = true) => ({
  id,
  integrationID: "opencode-go",
  label: "OpenCode Go",
  active,
  value: { type: "key", key: `oc_sk_${id}` },
})

it("selects the first active Go key", () => {
  expect(selectGoCredential([key("a", false), key("b")])).toEqual({
    kind: "key",
    key: "oc_sk_b",
    credentialID: "b",
    source: "credential",
  })
})

it("ignores malformed credential entries", () => {
  expect(selectGoCredential([null, { id: "x" }, { id: "y", value: null }])).toEqual({
    kind: "none",
  })
})

it("reports Console-only and none", () => {
  expect(
    selectGoCredential([
      {
        id: "c",
        integrationID: "opencode-go",
        label: "Go",
        active: true,
        value: { type: "oauth" },
      },
    ]),
  ).toEqual({ kind: "console-only", credentialID: "c" })
  expect(selectGoCredential([{ ...key("a"), integrationID: "other" }])).toEqual({ kind: "none" })
})

it("reads the auth.json fallback", () => {
  expect(readAuthFile({ "opencode-go": { type: "key", key: "oc_sk_file" } })).toEqual({
    kind: "key",
    key: "oc_sk_file",
    credentialID: "auth.json",
    source: "auth",
  })
  expect(readAuthFile({})).toEqual({ kind: "none" })
  expect(readAuthFile({ "opencode-go": { type: "oauth" } })).toEqual({
    kind: "console-only",
    credentialID: "auth.json",
  })
})
