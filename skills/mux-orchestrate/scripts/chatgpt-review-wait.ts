#!/usr/bin/env node
import { parseReviewBoundary } from "./chatgpt-browser-state.ts";
import { formatBrowserReviewState, readBrowserReviewState } from "./chatgpt-review-transport.ts";
import { isRetryableBrowserPollFailure, waitForChatGptReview } from "./chatgpt-review-wait-lib.ts";

function usage(): never {
  console.error("Usage: chatgpt-review-wait.mjs <cmux|rex> <surface-or-pane> <REQUEST_ID|ADOPT_TOKEN>");
  process.exit(2);
}

const [tool, target, boundaryValue, ...extra] = process.argv.slice(2);
if (extra.length > 0 || typeof tool !== "string" || !["cmux", "rex"].includes(tool) || !target || !boundaryValue) {
  usage();
}

const selectedTool = tool as "cmux" | "rex";
const selectedTarget = target as string;
const selectedBoundaryValue = boundaryValue as string;
const boundary = parseReviewBoundary(selectedBoundaryValue);

function poll(): string {
  try {
    return formatBrowserReviewState(readBrowserReviewState(selectedTool, selectedTarget, boundary), selectedBoundaryValue);
  } catch (error) {
    if (isRetryableBrowserPollFailure(error)) {
      return "waiting transient browser read failure";
    }
    throw error;
  }
}

const result = await waitForChatGptReview({
  poll,
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  now: Date.now,
  onStatus: message => console.error(message),
  pollIntervalMs: 60_000,
  statusIntervalMs: 300_000,
  requestId: selectedBoundaryValue,
});
process.stdout.write(`${result}\n`);
