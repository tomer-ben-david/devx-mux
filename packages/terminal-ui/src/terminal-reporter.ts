import type { Writable } from "node:stream";
import type { ReviewReport } from "@devx-crew/reviewer";

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

  document(report: ReviewReport): void {
    this.finishActivity();
    if (!this.interactive) {
      this.write(`\n${report.markdown}\n`);
      return;
    }
    const counts = { P1: 0, P2: 0, P3: 0 };
    for (const finding of report.findings) counts[finding.severity] += 1;
    const passed = report.standards.filter((entry) => entry.status === "PASS").length;
    const failed = report.standards.filter((entry) => entry.status === "FAIL").length;
    const notApplicable = report.standards.filter((entry) => entry.status === "N/A").length;
    const verdict = failed > 0 || report.findings.length > 0 ? "CHANGES RECOMMENDED" : "NO ISSUES FOUND";

    this.write("\n");
    this.write(`${this.paint("1;32", "╭─ REVIEW COMPLETED ")}${this.paint("2", "─".repeat(38))}\n`);
    this.write(`${this.paint("2", "│")} Execution   ${this.paint("1;32", "PASS")}  Reviewer finished successfully\n`);
    this.write(`${this.paint("2", "│")} Verdict     ${this.paint(failed > 0 ? "1;33" : "1;32", verdict)}  ${report.findings.length} ${report.findings.length === 1 ? "issue" : "issues"} found\n`);
    this.write(`${this.paint("2", "│")} Severity    ${this.severity("P1", counts.P1)} ${this.paint("2", "blocker")}   ${this.severity("P2", counts.P2)} ${this.paint("2", "important")}   ${this.severity("P3", counts.P3)} ${this.paint("2", "improvement")}\n`);
    this.write(`${this.paint("2", "│")} Standards   ${this.paint("32", `${passed} met`)}  ${this.paint("31", `${failed} violated`)}  ${this.paint("2", `${notApplicable} not applicable`)}\n`);
    this.write(`${this.paint("2", "╰" + "─".repeat(56))}\n`);

    if (report.findings.length > 0) {
      this.section("Findings");
      for (const finding of report.findings) {
        this.write(`${this.severity(finding.severity, undefined)} ${this.paint("2", this.severityMeaning(finding.severity))}  ${this.paint("1", finding.title)}\n`);
        if (finding.location.length > 0) this.labeledDetail("Where", finding.location);
        if (finding.consequence.length > 0) this.labeledDetail("Impact", finding.consequence);
        if (finding.correction.length > 0) this.labeledDetail("Fix", finding.correction);
        this.write("\n");
      }
    }

    this.section("Standards");
    this.write(`${this.paint("32", "PASS")} met   ${this.paint("31", "FAIL")} violated, linked to a finding   ${this.paint("2", "N/A")} not applicable\n\n`);
    for (const entry of report.standards) {
      const badge = entry.status === "PASS" ? this.paint("32", "PASS") : entry.status === "FAIL" ? this.paint("31", "FAIL") : this.paint("2", "N/A ");
      this.write(`${badge}  ${entry.item}\n`);
      if (entry.status === "FAIL") this.labeledDetail("Why", entry.evidence);
    }

    if (report.verificationGaps.length > 0) {
      this.section("Not verified");
      this.write(`${this.paint("2", "These are coverage gaps, not confirmed failures.")}\n`);
      for (const gap of report.verificationGaps) this.writeWrapped(`• ${gap}`, 2);
    }
  }

  usage(details: readonly string[]): void {
    if (details.length === 0) return;
    this.write(`\n${this.paint("1;36", "Usage")} ${details.join(this.paint("2", " · "))}\n`);
  }

  artifact(path: string): void {
    this.write(`\n${this.paint("1;36", "Full report")} ${this.paint("2", path)}\n`);
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

  private section(title: string): void {
    this.write(`\n${this.paint("1;35", title)}\n${this.paint("2", "─".repeat(title.length))}\n`);
  }

  private severity(level: string, count?: number): string {
    const code = level === "P1" ? "1;31" : level === "P2" ? "1;33" : "1;36";
    return this.paint(code, count === undefined ? level : `${level} ${count}`);
  }

  private severityMeaning(level: string): string {
    return level === "P1" ? "BLOCKER" : level === "P2" ? "IMPORTANT" : "IMPROVEMENT";
  }

  private labeledDetail(label: string, value: string): void {
    this.write(`${this.paint("2", label.padEnd(8))}`);
    this.writeWrapped(value, 8, false);
  }

  private writeWrapped(text: string, indent: number, firstLineIndented = true): void {
    const width = Math.max(30, ((this.output as NodeJS.WriteStream).columns ?? 100) - indent);
    const plainText = text.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, "");
    const prefix = " ".repeat(indent);
    for (const [index, line] of this.wrap(plainText.trimStart(), width).entries()) {
      this.write(`${index === 0 && !firstLineIndented ? "" : prefix}${line}\n`);
    }
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
