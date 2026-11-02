import { expect, it } from "vitest"
import {
  readAuthFile,
  selectConsoleCredential,
  selectGoCredential,
} from "./credentials"

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

it("selects the active Console OAuth credential", () => {
  expect(
    selectConsoleCredential([
      {
        id: "console",
        integrationID: "opencode",
        label: "Personal",
        active: true,
        value: {
          type: "oauth",
          access: "console-access",
          metadata: {
            server: "https://opencode.ai/console",
            orgID: "org_1",
            orgName: "Personal",
          },
        },
      },
      {
        id: "other",
        integrationID: "opencode",
        active: false,
        value: {
          type: "oauth",
          access: "inactive",
          metadata: { orgID: "org_2" },
        },
      },
    ]),
  ).toEqual({
    access: "console-access",
    orgID: "org_1",
    server: "https://opencode.ai/console",
    orgName: "Personal",
    credentialID: "console",
  })
  expect(selectConsoleCredential([])).toBeUndefined()
  expect(
    selectConsoleCredential([
      {
        id: "console",
        integrationID: "opencode",
        active: true,
        value: { type: "oauth", access: "x", metadata: {} },
      },
    ]),
  ).toBeUndefined()
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
