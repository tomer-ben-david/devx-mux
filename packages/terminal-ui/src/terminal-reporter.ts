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
    this.animated = options.animated ?? ((this.output as NodeJS.WriteStream).isTTY === true);
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
    }
  }

  document(markdown: string): void {
    this.finishActivity();
    this.write("\n");
    for (const line of markdown.trim().split(/\r?\n/)) {
      if (/\|\s*PASS\s*\|/.test(line)) this.write(`${this.paint("32", line)}\n`);
      else if (/\|\s*FAIL\s*\|/.test(line)) this.write(`${this.paint("31", line)}\n`);
      else if (/\|\s*N\/A\s*\|/.test(line)) this.write(`${this.paint("2", line)}\n`);
      else if (/^###? P1\b/.test(line)) this.write(`${this.paint("1;31", line)}\n`);
      else if (/^###? P2\b/.test(line)) this.write(`${this.paint("1;33", line)}\n`);
      else if (/^###? P3\b/.test(line)) this.write(`${this.paint("1;36", line)}\n`);
      else if (/^#{1,3} /.test(line)) this.write(`${this.paint("1;35", line)}\n`);
      else this.write(`${line}\n`);
    }
  }

  usage(details: readonly string[]): void {
    if (details.length === 0) return;
    this.write(`\n${this.paint("1;36", "Usage")} ${details.join(this.paint("2", " · "))}\n`);
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
    this.write(`\r${ESCAPE}2K`);
    this.row(
      this.paint("32", "✓"),
      this.activityLabel ?? "Reviewer",
      this.activityDetail ?? "Ready",
    );
    if (this.viewportDrawn) {
      for (let index = 0; index < 10; index += 1) this.write(`${ESCAPE}2K\n`);
      this.write(`${ESCAPE}10A`);
    }
    this.activityLabel = undefined;
    this.activityDetail = undefined;
    this.viewportDrawn = false;
  }

  private redrawActivity(activity: string): void {
    if (this.viewportDrawn) this.write(`\r${ESCAPE}11A`);
    this.write(`${ESCAPE}2K${activity}\n`);
    const visible = this.liveLines.slice(-10);
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
    const width = Math.max(24, ((this.output as NodeJS.WriteStream).columns ?? 100) - 4);
    const clipped = text.length > width ? `${text.slice(0, width - 1)}…` : text;
    this.write(`${this.paint("2", "│")} ${marker} ${this.paint(kind === "tool" ? "33" : kind === "reasoning" ? "35" : "36", clipped)}${newline ? "\n" : ""}`);
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
