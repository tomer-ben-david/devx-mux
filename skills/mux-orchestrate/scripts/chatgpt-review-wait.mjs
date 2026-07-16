#!/usr/bin/env node

// skills/mux-orchestrate/scripts/chatgpt-review-wait.ts
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// skills/mux-orchestrate/scripts/chatgpt-review-wait-lib.ts
async function waitForChatGptReview(options) {
  const startedAt = options.now();
  let nextStatusAt = startedAt + options.statusIntervalMs;
  let polls = 0;
  let candidate = "";
  let candidatePolls = 0;
  for (; ; ) {
    await options.sleep(options.pollIntervalMs);
    const output = options.poll().trimEnd();
    polls += 1;
    if (!output) {
      throw new Error("ChatGPT review poll returned an empty response");
    }
    if (output.startsWith("waiting ")) {
      candidate = "";
      candidatePolls = 0;
    } else if (output === candidate) {
      candidatePolls += 1;
    } else {
      candidate = output;
      candidatePolls = 1;
    }
    if (candidatePolls >= 3) {
      return candidate;
    }
    const currentTime = options.now();
    if (currentTime >= nextStatusAt) {
      const elapsedMinutes = Math.floor((currentTime - startedAt) / 6e4);
      const settling = candidatePolls > 0 ? ` settling=${candidatePolls}/3` : "";
      options.onStatus(`waiting ChatGPT review elapsed=${elapsedMinutes}m polls=${polls}${settling} ${options.requestId}`);
      nextStatusAt = currentTime + options.statusIntervalMs;
    }
  }
}

// skills/mux-orchestrate/scripts/chatgpt-review-wait.ts
function usage() {
  console.error("Usage: chatgpt-review-wait.mjs <cmux|rex> <surface-or-pane> REQUEST_ID=<id>");
  process.exit(2);
}
var [tool, target, requestId, ...extra] = process.argv.slice(2);
if (extra.length > 0 || typeof tool !== "string" || !["cmux", "rex"].includes(tool) || !target || !requestId?.startsWith("REQUEST_ID=")) {
  usage();
}
var selectedTool = tool;
var scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
var poller = path.join(scriptDirectory, selectedTool === "cmux" ? "cmux-review-poll.sh" : "rex-review-poll.sh");
var pollArguments = selectedTool === "cmux" ? ["browser", target, requestId] : [target, requestId];
var result = await waitForChatGptReview({
  poll: () => execFileSync(poller, pollArguments, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: Date.now,
  onStatus: (message) => console.error(message),
  pollIntervalMs: 6e4,
  statusIntervalMs: 3e5,
  requestId
});
process.stdout.write(`${result}
`);
