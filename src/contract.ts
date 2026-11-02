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

const ModelUsageSchema = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  name: Schema.String,
  monthlyCost: Schema.Number,
  weeklyCost: Schema.Number,
  rollingCost: Schema.Number,
  monthlyTokens: Schema.Number,
})

const ModelAnalyticsSchema = Schema.Struct({
  models: Schema.Array(ModelUsageSchema),
  monthlyFrom: Schema.Number,
  monthlyTo: Schema.Number,
  weeklyFrom: Schema.Number,
  rollingFrom: Schema.Number,
  totalMonthlyCost: Schema.Number,
  serverMonthlyPercent: Schema.Number,
})

const ModelAnalyticsResultSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("ok"), data: ModelAnalyticsSchema }),
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
    models: {
      input: Schema.Struct({
        server: Schema.optional(Schema.String),
        monthlyResetsAt: Schema.optional(Schema.Number),
        monthlyPercent: Schema.optional(Schema.Number),
        force: Schema.optional(Schema.Boolean),
      }),
      output: ModelAnalyticsResultSchema,
    },
  },
})

