#!/usr/bin/env node
import { createHash } from "node:crypto";
import { parseReviewBoundary, RequestBoundaryTracker, serializeReadyRecord, type TurnBoundary } from "./chatgpt-browser-state.ts";
import { formatBrowserReviewState, readBrowserReviewState, readReviewPage } from "./chatgpt-review-transport.ts";
import { isRetryableBrowserPollFailure, waitForChatGptReview } from "./chatgpt-review-wait-lib.ts";

function usage(): never {
  console.error("Usage: chatgpt-review-wait.mjs <cmux|rex> <surface-or-pane> <REQUEST_ID|REQUEST_TOKEN|TURN_TOKEN>");
  process.exit(2);
}

const [tool, target, boundaryValue, ...extra] = process.argv.slice(2);
if (extra.length > 0 || typeof tool !== "string" || !["cmux", "rex"].includes(tool) || !target || !boundaryValue) {
  usage();
}

const selectedTool = tool as "cmux" | "rex";
const selectedTarget = target as string;
const selectedBoundaryValue = boundaryValue as string;
const requestedBoundary = parseReviewBoundary(selectedBoundaryValue);
let boundary: TurnBoundary | undefined = requestedBoundary.kind === "turn" ? requestedBoundary : undefined;
const tracker = new RequestBoundaryTracker();

function poll(): string {
  try {
    if (!boundary) {
      const page = readReviewPage(selectedTool, selectedTarget);
      boundary = tracker.observe(page.html, page.conversationUrl, requestedBoundary as Extract<typeof requestedBoundary, { kind: "unbound-request" }>);
      return boundary ? `waiting bound ${boundary.label}` : `waiting submitted turn stability ${selectedBoundaryValue}`;
    }
    return formatBrowserReviewState(readBrowserReviewState(selectedTool, selectedTarget, boundary), boundary.label);
  } catch (error) {
    if (isRetryableBrowserPollFailure(error)) {
      return "waiting transient browser read failure";
    }
    throw error;
  }
}

const settledBody = await waitForChatGptReview({
  poll,
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  now: Date.now,
  onStatus: message => console.error(message),
  pollIntervalMs: 60_000,
  statusIntervalMs: 300_000,
  requestId: selectedBoundaryValue,
});
if (!boundary) throw new Error("ChatGPT waiter completed without a bound turn");
const digest = createHash("sha256").update(settledBody, "utf8").digest("hex");
process.stdout.write(`${serializeReadyRecord(boundary, digest)}\n`);
