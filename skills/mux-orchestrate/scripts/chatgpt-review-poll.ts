#!/usr/bin/env node
import { parseReviewBoundary } from "./chatgpt-browser-state.ts";
import { formatBrowserReviewState, readBrowserReviewState } from "./chatgpt-review-transport.ts";

const [tool, target, boundaryValue, ...extra] = process.argv.slice(2);
if (
  extra.length > 0 || !["cmux", "rex"].includes(tool ?? "") || !target || !boundaryValue
) {
  console.error("Usage: chatgpt-review-poll.mjs <cmux|rex> <surface-or-pane> <REQUEST_ID|ADOPT_TOKEN>");
  process.exit(2);
}

const selectedTool = tool as "cmux" | "rex";
const boundary = parseReviewBoundary(boundaryValue);
const state = readBrowserReviewState(selectedTool, target, boundary);
process.stdout.write(`${formatBrowserReviewState(state, boundaryValue)}\n`);
