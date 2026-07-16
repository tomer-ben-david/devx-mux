#!/usr/bin/env node
import { createHash } from "node:crypto";
import { parseReadyRecord, parseReviewBoundary } from "./chatgpt-browser-state.ts";
import { bindBrowserReviewBoundary, formatBrowserReviewState, readBrowserReviewState } from "./chatgpt-review-transport.ts";

const [tool, target, boundaryValue, ...extra] = process.argv.slice(2);
if (
  extra.length > 0 || !["cmux", "rex"].includes(tool ?? "") || !target || !boundaryValue
) {
  console.error("Usage: chatgpt-review-poll.mjs <cmux|rex> <surface-or-pane> <REQUEST_ID|TURN_TOKEN|READY_TOKEN>");
  process.exit(2);
}

const selectedTool = tool as "cmux" | "rex";
const ready = parseReadyRecord(boundaryValue);
const boundary = ready?.boundary ?? bindBrowserReviewBoundary(selectedTool, target, parseReviewBoundary(boundaryValue));
const state = readBrowserReviewState(selectedTool, target, boundary);
const result = formatBrowserReviewState(state, boundary.label);
if (ready) {
  const digest = createHash("sha256").update(result, "utf8").digest("hex");
  if (result.startsWith("waiting ") || digest !== ready.digest) {
    throw new Error("Completed ChatGPT response no longer matches the settled digest; rerun the waiter for this turn");
  }
}
process.stdout.write(`${result}\n`);
