#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { encodeRequestToken } from "./chatgpt-browser-state.ts";

const [label, promptFile, ...extra] = process.argv.slice(2);
if (extra.length > 0 || !label?.startsWith("MUX_REQUEST_ID=") || !promptFile) {
  console.error("Usage: chatgpt-review-request.mjs MUX_REQUEST_ID=<id> <prompt-file>");
  process.exit(2);
}

const prompt = readFileSync(promptFile, "utf8");
process.stdout.write(`${encodeRequestToken(label, prompt)}\n`);
