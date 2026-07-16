#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillDirectory = path.resolve(scriptDirectory, "..");

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function defaultTarget(): string {
  const rex = Object.entries(process.env).some(
    ([key, value]) => key.startsWith("APP_NAME_") && ["rex", "rexide"].includes(value?.toLowerCase() ?? ""),
  );
  return rex ? "rex" : "chatgpt";
}

function isTarget(value: string | undefined): boolean {
  return value === "chatgpt" || value === "chatgpt-rex" || value === "browser" || value === "rex" || Boolean(value?.startsWith("surface:"));
}

function muxSkillDirectory(): string {
  return (
    process.env.MUX_ORCHESTRATE_SKILL_DIR ??
    path.join(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"), "skills", "mux-orchestrate")
  );
}

function runTransport(command: string, args: string[]): void {
  if (!existsSync(command)) fail(`Missing transport: ${command}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function send(args: string[]): void {
  if (args.length < 1 || args.length > 3) {
    fail("Usage: staged-review-send.sh <1|2|3|4> [target] [prompt-file]", 2);
  }

  const stage = args[0]!;
  if (!new Set(["1", "2", "3", "4"]).has(stage)) fail("Stage must be 1, 2, 3, or 4", 2);
  const target = isTarget(args[1]) ? args[1]! : defaultTarget();
  const promptArgument = isTarget(args[1]) ? args[2] : args[1];

  const prUrl = process.env.STAGED_PR_URL;
  const compareUrl = process.env.STAGED_COMPARE_URL;
  if (!prUrl) fail("Missing environment variable: STAGED_PR_URL", 2);
  if (!compareUrl) fail("Missing environment variable: STAGED_COMPARE_URL", 2);

  const repository = process.env.STAGED_REPO;
  const branch = process.env.STAGED_BRANCH ?? (repository ? git(repository, "branch", "--show-current") : "");
  const head = process.env.STAGED_COMMIT ?? (repository ? git(repository, "rev-parse", "--short", "HEAD") : "");
  const commitSubject = process.env.STAGED_COMMIT_SUBJECT ?? (repository ? git(repository, "log", "-1", "--format=%s") : "");
  const templateDirectory = process.env.STAGED_REVIEW_TEMPLATE_DIR ?? path.join(skillDirectory, "references");
  const templateNames: Record<string, string> = {
    "1": "stage1-last-commit.txt",
    "2": "stage2-branch-functional.txt",
    "3": "stage3-standards.txt",
    "4": "stage4-full-pr-review.txt",
  };
  const templateFile = path.join(templateDirectory, templateNames[stage]!);
  if (!existsSync(templateFile)) fail(`Stage template not found: ${templateFile}`);

  const requestId = process.env.STAGED_REQUEST_ID ?? `staged-s${stage}-${Math.floor(Date.now() / 1000)}`;
  const promptFile = promptArgument ?? path.join(tmpdir(), `${requestId}.txt`);
  const replacements: Record<string, string> = {
    REQUEST_ID: requestId,
    PR_URL: prUrl,
    COMPARE_URL: compareUrl,
    BASE: process.env.STAGED_BASE ?? "the PR base branch",
    BRANCH: branch,
    HEAD: head,
    COMMIT_SUBJECT: commitSubject,
    DEVX_STANDARDS_READ_CLAUSE: "",
  };
  if (stage === "3") {
    const clauseFile = path.join(templateDirectory, "devx-standards-read-clause.txt");
    if (!existsSync(clauseFile)) fail(`Standards clause not found: ${clauseFile}`);
    replacements.DEVX_STANDARDS_READ_CLAUSE = readFileSync(clauseFile, "utf8");
  }

  const template = readFileSync(templateFile, "utf8");
  const unresolved = [...template.matchAll(/\{\{([^}]+)\}\}/g)]
    .filter((match) => !Object.hasOwn(replacements, match[1]!))
    .map((match) => match[0]);
  if (unresolved.length > 0) fail(`Unresolved stage template values: ${unresolved.join(", ")}`);
  const prompt = template.replace(/\{\{([^}]+)\}\}/g, (_token, key: string) => replacements[key]!);
  writeFileSync(promptFile, prompt);
  process.stdout.write(`prompt=${promptFile}\nrequest_id=${requestId}\n`);

  if (process.env.STAGED_REVIEW_DRY_RUN === "1") {
    process.stdout.write(prompt);
    return;
  }

  const muxSkill = muxSkillDirectory();
  if (!existsSync(path.join(muxSkill, "SKILL.md"))) fail(`Mux Orchestrate skill not found: ${muxSkill}`);
  if (target === "rex") {
    runTransport(path.join(muxSkill, "scripts", "rex-review-send.sh"), [
      process.env.STAGED_REX_TARGET ?? "chatgpt",
      promptFile,
    ]);
  } else {
    runTransport(path.join(muxSkill, "scripts", "cmux-review-send.sh"), ["browser", target, promptFile]);
  }
  process.stdout.write(`poll_hint: ${path.join(scriptDirectory, "staged-review-poll.sh")} ${target} REQUEST_ID=${requestId}\n`);
}

function poll(args: string[]): void {
  if (args.length < 1 || args.length > 2) {
    fail("Usage: staged-review-poll.sh [target] REQUEST_ID=<id>", 2);
  }
  const target = isTarget(args[0]) ? args[0]! : defaultTarget();
  const requestId = isTarget(args[0]) ? args[1] : args[0];
  if (!requestId?.startsWith("REQUEST_ID=")) fail(`Expected REQUEST_ID=<id>, got: ${requestId ?? ""}`, 2);

  const muxSkill = muxSkillDirectory();
  if (!existsSync(path.join(muxSkill, "SKILL.md"))) fail(`Mux Orchestrate skill not found: ${muxSkill}`);
  if (target === "rex") {
    runTransport(path.join(muxSkill, "scripts", "rex-review-poll.sh"), [
      process.env.STAGED_REX_TARGET ?? "chatgpt",
      requestId,
    ]);
  } else {
    runTransport(path.join(muxSkill, "scripts", "cmux-review-poll.sh"), ["browser", target, requestId]);
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "send") send(args);
else if (command === "poll") poll(args);
else fail("Usage: staged-review.ts <send|poll> ...", 2);
