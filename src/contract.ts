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
})

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
  },
})

