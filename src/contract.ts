import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

const WindowSchema = Schema.Struct({
  percent: Schema.Number,
  limited: Schema.Boolean,
  resetsAt: Schema.Number,
})

const DataSchema = Schema.Struct({
  windows: Schema.Struct({
    rolling: WindowSchema,
    weekly: WindowSchema,
    monthly: WindowSchema,
  }),
  updatedAt: Schema.Number,
  stale: Schema.Boolean,
  error: Schema.optional(Schema.String),
  workspace: Schema.optional(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      usageURL: Schema.String,
    }),
  ),
})

const ConsoleModelSchema = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  name: Schema.String,
  cost: Schema.Number,
  requests: Schema.Number,
  tokens: Schema.Number,
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadTokens: Schema.Number,
  cacheWrite5mTokens: Schema.Number,
  cacheWrite1hTokens: Schema.Number,
})

const ConsoleModelsResultSchema = Schema.Union([
  Schema.Struct({
    state: Schema.Literal("ok"),
    data: Schema.Struct({
      models: Schema.Array(ConsoleModelSchema),
      range: Schema.Literal("30d"),
      totalCost: Schema.Number,
      source: Schema.Union([
        Schema.Literal("server"),
        Schema.Literal("desktop"),
      ]),
    }),
  }),
  Schema.Struct({ state: Schema.Literal("error"), message: Schema.String }),
])

const ResultSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("ok"), data: DataSchema }),
  Schema.Struct({ state: Schema.Literal("signed-out") }),
  Schema.Struct({ state: Schema.Literal("console-only") }),
  Schema.Struct({
    state: Schema.Literal("unavailable"),
    message: Schema.String,
    data: Schema.optional(DataSchema),
  }),
  Schema.Struct({ state: Schema.Literal("rejected"), message: Schema.String }),
  Schema.Struct({
    state: Schema.Literal("no-plan"),
    message: Schema.String,
    data: Schema.optional(DataSchema),
  }),
  Schema.Struct({
    state: Schema.Literal("error"),
    message: Schema.String,
    data: Schema.optional(DataSchema),
  }),
])

export const UsageIpc = Ipc.define({
  id: "opencode-go-usage.data",
  methods: {
    get: {
      input: Schema.Struct({
        server: Schema.optional(Schema.String),
        force: Schema.optional(Schema.Boolean),
      }),
      output: ResultSchema,
    },
    consoleModels: {
      input: Schema.Struct({
        server: Schema.optional(Schema.String),
        force: Schema.optional(Schema.Boolean),
      }),
      output: ConsoleModelsResultSchema,
    },
  },
})

