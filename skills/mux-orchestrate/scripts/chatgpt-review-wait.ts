#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ReviewWaitOptions = {
  poll: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  onStatus: (message: string) => void;
  pollIntervalMs: number;
  statusIntervalMs: number;
  requestId: string;
};

export async function waitForChatGptReview(options: ReviewWaitOptions): Promise<string> {
  const startedAt = options.now();
  let nextStatusAt = startedAt + options.statusIntervalMs;
  let polls = 0;

  for (;;) {
    await options.sleep(options.pollIntervalMs);
    const output = options.poll().trimEnd();
    polls += 1;

    if (!output) {
      throw new Error("ChatGPT review poll returned an empty response");
    }
    if (!output.startsWith("waiting ")) {
      return output;
    }

    const currentTime = options.now();
    if (currentTime >= nextStatusAt) {
      const elapsedMinutes = Math.floor((currentTime - startedAt) / 60_000);
      options.onStatus(`waiting ChatGPT review elapsed=${elapsedMinutes}m polls=${polls} ${options.requestId}`);
      nextStatusAt = currentTime + options.statusIntervalMs;
    }
  }
}

function usage(): never {
  console.error("Usage: chatgpt-review-wait.ts <cmux|rex> <surface-or-pane> REQUEST_ID=<id>");
  process.exit(2);
}

async function main(): Promise<void> {
  const [tool, target, requestId, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || typeof tool !== "string" || !["cmux", "rex"].includes(tool) || !target || !requestId?.startsWith("REQUEST_ID=")) {
    usage();
  }
  const selectedTool = tool as "cmux" | "rex";
  const selectedTarget = target as string;
  const selectedRequestId = requestId as string;

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const poller = path.join(scriptDirectory, selectedTool === "cmux" ? "cmux-review-poll.sh" : "rex-review-poll.sh");
  const pollArguments = selectedTool === "cmux"
    ? ["browser", selectedTarget, selectedRequestId]
    : [selectedTarget, selectedRequestId];

  const result = await waitForChatGptReview({
    poll: () => execFileSync(poller, pollArguments, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }),
    sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    now: Date.now,
    onStatus: message => console.error(message),
    pollIntervalMs: 60_000,
    statusIntervalMs: 300_000,
    requestId: selectedRequestId,
  });
  process.stdout.write(`${result}\n`);
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  await main();
}
