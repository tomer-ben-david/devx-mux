import type { Writable } from "node:stream";

const ESCAPE = "\u001B[";

interface TerminalReporterOptions {
  readonly output?: Writable;
  readonly color?: boolean;
  readonly animated?: boolean;
  readonly startedAt?: number;
}

export class TerminalReporter {
  private readonly output: Writable;
  private readonly color: boolean;
  private readonly animated: boolean;
  private readonly interactive: boolean;
  private readonly startedAt: number;
  private providerBuffer = "";
  private activityTimer: NodeJS.Timeout | undefined;
  private activityLabel: string | undefined;
  private activityDetail: string | undefined;
  private readonly liveLines: Array<{ kind: "reasoning" | "tool" | "message"; text: string }> = [];
  private viewportDrawn = false;

  constructor(options: TerminalReporterOptions = {}) {
    this.output = options.output ?? process.stdout;
    this.color = options.color ?? (process.stdout.isTTY === true && process.env.NO_COLOR === undefined);
    this.interactive = (this.output as NodeJS.WriteStream).isTTY === true;
    this.animated = options.animated ?? this.interactive;
    this.startedAt = options.startedAt ?? Date.now();
  }

  heading(tool: string, detail: string): void {
    this.write(this.paint("36", "╭─") + ` ${this.paint("1;36", "DEVX CREW")} ${this.paint("35", "//")} ${this.paint("1", tool.toUpperCase())}\n`);
    this.write(this.paint("36", "│") + `  ${detail}\n`);
    this.write(this.paint("36", "╰─") + "\n\n");
  }

  success(label: string, detail: string): void {
    this.row(this.paint("32", "✓"), label, detail);
  }

  active(label: string, detail: string): void {
    if (!this.animated) {
      this.row(this.paint("36", "◆"), label, detail);
      return;
    }

    this.activityLabel = label;
    this.activityDetail = detail;
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    const render = () => {
      const symbol = this.paint("36", frames[frame % frames.length] ?? "◆");
      const activeLabel = this.activityLabel ?? label;
      const activeDetail = this.activityDetail ?? detail;
      this.redrawActivity(`${symbol} ${this.paint("1", activeLabel.padEnd(12))} ${activeDetail}`);
      frame += 1;
    };
    render();
    this.activityTimer = setInterval(render, 80);
  }

  result(detail: string): void {
    this.finishActivity();
    this.write(`\n${this.paint("1;32", "✓ Complete")} ${detail} ${this.paint("2", `· ${this.elapsed()}`)}\n`);
  }

  updateActivity(label: string, detail: string): void {
    this.activityLabel = label;
    this.activityDetail = detail;
  }

  live(kind: "reasoning" | "tool" | "message", text: string): void {
    const clean = text.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, "").replace(/[\r\t]+/g, " ");
    for (const rawLine of clean.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      this.liveLines.push({ kind, text: line });
    }
    if (this.liveLines.length > 10) this.liveLines.splice(0, this.liveLines.length - 10);
    if (!this.animated) {
      const latest = this.liveLines.at(-1);
      if (latest !== undefined) this.writeLiveLine(latest.kind, latest.text);
    } else if (this.viewportDrawn) {
      const label = this.activityLabel ?? "Reviewer";
      const detail = this.activityDetail ?? "Working";
      this.redrawActivity(`${this.paint("36", "◆")} ${this.paint("1", label.padEnd(12))} ${detail}`);
    }
  }

  usage(details: readonly string[]): void {
    if (details.length === 0) return;
    this.write(`\n${this.paint("1;36", "Usage")} ${details.join(this.paint("2", " · "))}\n`);
  }

  artifact(path: string, label = "Full report"): void {
    this.write(`\n${this.paint("1;36", label)} ${this.paint("2", path)}\n`);
  }

  empty(detail: string): void {
    this.write(`\n${this.paint("1;32", "✓ Nothing to review")} ${detail} ${this.paint("2", `· ${this.elapsed()}`)}\n`);
  }

  failure(detail: string): void {
    this.finishActivity();
    this.write(`\n${this.paint("1;31", "✗ Failed")} ${detail} ${this.paint("2", `· ${this.elapsed()}`)}\n`);
  }

  providerChunk(chunk: string): void {
    this.finishActivity();
    this.providerBuffer += chunk;
    const lines = this.providerBuffer.split(/\r?\n/);
    this.providerBuffer = lines.pop() ?? "";
    for (const line of lines) {
      this.writeProviderLine(line);
    }
  }

  flushProvider(): void {
    this.finishActivity();
    if (this.providerBuffer.length > 0) {
      this.writeProviderLine(this.providerBuffer);
      this.providerBuffer = "";
    }
  }

  private row(symbol: string, label: string, detail: string): void {
    this.write(`${symbol} ${this.paint("1", label.padEnd(12))} ${detail}\n`);
  }

  private finishActivity(): void {
    if (this.activityTimer === undefined) {
      return;
    }
    clearInterval(this.activityTimer);
    this.activityTimer = undefined;
    if (this.viewportDrawn) this.write(`\r${ESCAPE}11A`);
    this.write(`\r${this.viewportDrawn ? `${ESCAPE}0J` : ESCAPE + "2K"}`);
    this.row(
      this.paint("32", "✓"),
      this.activityLabel ?? "Reviewer",
      this.activityDetail ?? "Ready",
    );
    this.activityLabel = undefined;
    this.activityDetail = undefined;
    this.viewportDrawn = false;
  }

  private redrawActivity(activity: string): void {
    if (this.viewportDrawn) this.write(`\r${ESCAPE}11A`);
    this.write(`${ESCAPE}2K${activity}\n`);
    const width = Math.max(24, ((this.output as NodeJS.WriteStream).columns ?? 100) - 4);
    const visible = this.liveLines.flatMap((entry) =>
      this.wrap(entry.text, width).map((text) => ({ ...entry, text })),
    ).slice(-10);
    for (let index = 0; index < 10; index += 1) {
      this.write(`${ESCAPE}2K`);
      const entry = visible[index];
      if (entry !== undefined) this.writeLiveLine(entry.kind, entry.text, false);
      this.write("\n");
    }
    this.viewportDrawn = true;
  }

  private writeLiveLine(kind: "reasoning" | "tool" | "message", text: string, newline = true): void {
    const marker = kind === "tool" ? this.paint("33", "›") : kind === "reasoning" ? this.paint("35", "◆") : this.paint("36", "│");
    this.write(`${this.paint("2", "│")} ${marker} ${this.paint(kind === "tool" ? "33" : kind === "reasoning" ? "35" : "36", text)}${newline ? "\n" : ""}`);
  }

  private wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let remaining = text;
    while (remaining.length > width) {
      const candidate = remaining.slice(0, width + 1);
      const space = candidate.lastIndexOf(" ");
      const splitAt = space > Math.floor(width / 2) ? space : width;
      lines.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    lines.push(remaining);
    return lines;
  }

  private writeProviderLine(line: string): void {
    this.write(`${this.paint("2", "│")} ${line}\n`);
  }

  private elapsed(): string {
    const milliseconds = Math.max(0, Date.now() - this.startedAt);
    if (milliseconds < 1_000) {
      return `${milliseconds}ms`;
    }
    return `${(milliseconds / 1_000).toFixed(1)}s`;
  }

  private paint(code: string, value: string): string {
    return this.color ? `${ESCAPE}${code}m${value}${ESCAPE}0m` : value;
  }

  private write(value: string): void {
    this.output.write(value);
  }
}
