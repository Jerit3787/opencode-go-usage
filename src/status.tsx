import { Show } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import type { StatusCopy } from "./usage"

function actionLabel(action: StatusCopy["action"]): string {
  switch (action) {
    case "connect":
      return "Connect OpenCode Go"
    case "usage":
      return "Open built-in Usage"
    case "console":
      return "Open Console"
    case "retry":
      return "Retry"
    case "none":
      return ""
  }
}

export function StatusBlock(props: {
  copy: StatusCopy
  run(): void
  loading: boolean
  ui: Ui
}) {
  const ui = props.ui

  return (
    <Show
      when={!props.loading}
      fallback={
        <div style={{ display: "flex", "justify-content": "center", padding: "12px" }}>
          <ui.Loader size="small" />
        </div>
      }
    >
      <div style={{ display: "grid", gap: "8px", padding: "4px 4px 2px" }}>
        <div
          style={{
            "font-size": "13px",
            "font-weight": 590,
            color: "var(--v2-text-text-base)",
          }}
        >
          {props.copy.title}
        </div>
        <div
          style={{
            "font-size": "12px",
            color: "var(--v2-text-text-muted)",
            "line-height": "1.45",
          }}
        >
          {props.copy.body}
        </div>
        <Show when={props.copy.action !== "none"}>
          <button
            type="button"
            onClick={props.run}
            style={{
              "justify-self": "start",
              "margin-top": "2px",
              border: "none",
              "border-radius": "6px",
              background: "var(--v2-background-bg-button-neutral)",
              color: "var(--v2-text-text-base)",
              padding: "6px 10px",
              "font-size": "12px",
              "font-weight": 530,
              cursor: "pointer",
            }}
          >
            {actionLabel(props.copy.action)}
          </button>
        </Show>
      </div>
    </Show>
  )
}
