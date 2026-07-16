#!/usr/bin/env node
import { createAdoptionToken } from "./chatgpt-browser-state.ts";
import { readReviewPage } from "./chatgpt-review-transport.ts";

const [tool, target, ...extra] = process.argv.slice(2);
if (extra.length > 0 || !["cmux", "rex"].includes(tool ?? "") || !target) {
  console.error("Usage: chatgpt-review-adopt.mjs <cmux|rex> <surface-or-pane>");
  process.exit(2);
}

const page = readReviewPage(tool as "cmux" | "rex", target);
process.stdout.write(`${createAdoptionToken(page.html, page.conversationUrl)}\n`);
