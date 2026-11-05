import { USAGE_TITLE } from "./title"

export const usageStyles = `
:root {
  --oc-go-usage-percent: 0;
  --oc-go-usage-color: var(--v2-text-text-muted);
}

[data-slot="session-plugin-pill"][aria-label^=${JSON.stringify(USAGE_TITLE)}]::before {
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
