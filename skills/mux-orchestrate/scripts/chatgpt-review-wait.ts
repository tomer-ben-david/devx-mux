#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForChatGptReview } from "./chatgpt-review-wait-lib.ts";

function usage(): never {
  console.error("Usage: chatgpt-review-wait.mjs <cmux|rex> <surface-or-pane> REQUEST_ID=<id>");
  process.exit(2);
}

const [tool, target, requestId, ...extra] = process.argv.slice(2);
if (extra.length > 0 || typeof tool !== "string" || !["cmux", "rex"].includes(tool) || !target || !requestId?.startsWith("REQUEST_ID=")) {
  usage();
}

const selectedTool = tool as "cmux" | "rex";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const poller = path.join(scriptDirectory, selectedTool === "cmux" ? "cmux-review-poll.sh" : "rex-review-poll.sh");
const pollArguments = selectedTool === "cmux" ? ["browser", target, requestId] : [target, requestId];

const result = await waitForChatGptReview({
  poll: () => execFileSync(poller, pollArguments, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }),
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  now: Date.now,
  onStatus: message => console.error(message),
  pollIntervalMs: 60_000,
  statusIntervalMs: 300_000,
  requestId,
});
process.stdout.write(`${result}\n`);
