import type { ReviewProgress } from "@devx-crew/reviewer";

export type ReviewPanelId = "codex" | "grok";

export interface ReviewPanelState {
  readonly label: string;
  readonly color: string;
  readonly status: "starting" | "running" | "complete" | "failed";
  readonly activity: string;
  readonly detail: string;
  readonly events: readonly ReviewPanelEvent[];
}

interface ReviewPanelEvent {
  readonly kind: "reasoning" | "tool" | "message";
  readonly text: string;
}

interface DashboardSnapshot {
  readonly repository: string;
  readonly scope: string;
  readonly elapsedSeconds: number;
  readonly panels: Readonly<Record<ReviewPanelId, ReviewPanelState>>;
}

export interface ParallelReviewDashboard {
  configure(id: ReviewPanelId, detail: string): void;
  update(id: ReviewPanelId, progress: ReviewProgress): void;
  complete(id: ReviewPanelId, error?: string): void;
  close(): void;
}

export async function createParallelReviewDashboard(repository: string, scope: string, onCancel: () => void): Promise<ParallelReviewDashboard> {
  const [{ createCliRenderer }, opentuiReact, React] = await Promise.all([
    import("@opentui/core"),
    import("@opentui/react"),
    import("react"),
  ]);
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  const startedAt = Date.now();
  let snapshot: DashboardSnapshot = {
    repository,
    scope,
    elapsedSeconds: 0,
    panels: {
      codex: { label: "CODEX", color: "#5c9cf5", status: "starting", activity: "Starting reviewer", detail: "Provider configuration pending", events: [] },
      grok: { label: "GROK", color: "#b98cff", status: "starting", activity: "Starting reviewer", detail: "Provider configuration pending", events: [] },
    },
  };
  const listeners = new Set<() => void>();
  let renderTimer: NodeJS.Timeout | undefined;
  const emitNow = (): void => {
    renderTimer = undefined;
    listeners.forEach((listener) => listener());
  };
  const emit = (): void => {
    if (renderTimer === undefined) renderTimer = setTimeout(emitNow, 120);
  };
  const setPanel = (id: ReviewPanelId, panel: ReviewPanelState): void => {
    snapshot = { ...snapshot, panels: { ...snapshot.panels, [id]: panel } };
    emit();
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const frame = ["◆", "◇", "◈", "◇"];

  function App() {
    const state = React.useSyncExternalStore(subscribe, () => snapshot);
    const dimensions = opentuiReact.useTerminalDimensions();
    opentuiReact.useKeyboard((key) => {
      if (key.ctrl && key.name === "c") onCancel();
    });
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => {
      const timer = setInterval(() => {
        snapshot = { ...snapshot, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1_000) };
        emit();
        setTick((value) => value + 1);
      }, 500);
      return () => clearInterval(timer);
    }, []);
    const panel = (id: ReviewPanelId) => {
      const value = state.panels[id];
      const icon = value.status === "complete" ? "✓" : value.status === "failed" ? "✗" : frame[tick % frame.length];
      const statusColor = value.status === "complete" ? "#22c55e" : value.status === "failed" ? "#ef4444" : value.color;
      const contentWidth = Math.max(24, (dimensions.width >= 100 ? Math.floor(dimensions.width / 2) : dimensions.width) - 10);
      const fit = (text: string): string => text.length <= contentWidth ? text.padEnd(contentWidth) : `${text.slice(0, contentWidth - 1)}…`;
      const eventColor = (kind: ReviewPanelEvent["kind"]): string => kind === "tool" ? "#e5c07b" : kind === "reasoning" ? "#b98cff" : "#66d9c2";
      const eventLabel = (kind: ReviewPanelEvent["kind"]): string => kind === "tool" ? "TOOL" : kind === "reasoning" ? "THINK" : "NOTE";
      return React.createElement(
        "box",
        { flexGrow: 1, minWidth: 0, flexDirection: "column", border: true, borderStyle: "rounded", borderColor: value.color, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 },
        React.createElement("text", { fg: statusColor }, React.createElement("b", null, `${icon} ${value.label}`)),
        React.createElement("text", { fg: "#e0e0e0" }, fit(value.activity)),
        React.createElement("text", { fg: "#777777" }, fit(value.detail)),
        React.createElement("box", { height: 1 }),
        ...value.events.slice(-Math.max(3, Math.floor(dimensions.height / (dimensions.width >= 100 ? 1 : 2)) - 12)).map((event, index) =>
          React.createElement("text", { key: `${id}-${index}`, fg: eventColor(event.kind) }, fit(`${eventLabel(event.kind).padEnd(5)} ${event.text}`)),
        ),
      );
    };
    return React.createElement(
      "box",
      { width: dimensions.width, height: dimensions.height, backgroundColor: "#000000", flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 },
      React.createElement("text", { fg: "#66d9c2" }, React.createElement("b", null, "DEVX CREW  //  PARALLEL REVIEW")),
      React.createElement("text", { fg: "#777777" }, `${state.repository}  ·  ${state.scope}  ·  ${state.elapsedSeconds}s`.padEnd(Math.max(1, dimensions.width - 4))),
      React.createElement("box", { height: 1 }),
      React.createElement("box", { flexGrow: 1, flexDirection: dimensions.width >= 100 ? "row" : "column", gap: 1 }, panel("codex"), panel("grok")),
      React.createElement("box", { height: 1 }),
      React.createElement("text", { fg: "#555555" }, "Independent reviewers · shared scope · Ctrl+C cancels both"),
    );
  }

  opentuiReact.createRoot(renderer).render(React.createElement(App));

  return {
    configure(id, detail) {
      const current = snapshot.panels[id];
      setPanel(id, { ...current, status: "running", activity: "Ready", detail });
    },
    update(id, progress) {
      const current = snapshot.panels[id];
      const raw = progress.text;
      const clean = raw?.replace(/\s+/g, " ").trim();
      const kind = progress.kind ?? "message";
      const previous = current.events.at(-1);
      const shouldMerge = clean !== undefined && previous?.kind === kind && (clean.length < 40 || previous.text.length < 100);
      const events = clean === undefined || clean.length === 0
        ? current.events
        : shouldMerge
          ? [...current.events.slice(0, -1), {
              kind,
              text: `${previous.text}${raw !== undefined && /^\s/.test(raw) ? " " : ""}${clean}`.replace(/\s+/g, " ").trim(),
            }]
          : [...current.events, { kind, text: clean }];
      setPanel(id, {
        ...current,
        status: "running",
        activity: progress.status,
        events: events.slice(-20),
      });
    },
    complete(id, error) {
      const current = snapshot.panels[id];
      setPanel(id, {
        ...current,
        status: error === undefined ? "complete" : "failed",
        activity: error === undefined ? "Review complete" : "Review failed",
        detail: error ?? current.detail,
      });
    },
    close() {
      if (renderTimer !== undefined) clearTimeout(renderTimer);
      renderer.destroy();
    },
  };
}
