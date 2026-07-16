import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bindReviewBoundary, createAdoptionToken, parseBrowserReviewState, parseReadyRecord, parseReviewBoundary, RequestBoundaryTracker, serializeReadyRecord } from "./chatgpt-browser-state.ts";

const requestId = "REQUEST_ID=github:owner/repo:pr:9:head:abc:20260716T100000+0300";
const conversationUrl = "https://chatgpt.com/c/conversation-one";

function turn(role: "user" | "assistant", id: string, text: string, complete = false): string {
  const completion = complete ? '<button aria-label="Copy response"></button>' : "";
  return `<section data-turn="${role}"><div data-message-author-role="${role}" data-message-id="${id}">${text}</div>${completion}</section>`;
}

function requestBoundary(html: string) {
  return bindReviewBoundary(html, conversationUrl, parseReviewBoundary(requestId));
}

test("an earlier copy control cannot complete the current assistant turn", () => {
  const html = `<main id="thread">${turn("user", "old-user", "old request")}${turn("assistant", "old-answer", "old completed response", true)}${turn("user", "current-user", requestId)}${turn("assistant", "current-answer", "stable but incomplete response")}</main>`;
  const state = parseBrowserReviewState(html, conversationUrl, requestBoundary(html));
  assert.equal(state.responseObserved, true);
  assert.equal(state.responseComplete, false);
  assert.equal(state.answer, "stable but incomplete response");
});

test("completion is accepted only from the exact request-bound assistant turn", () => {
  const html = `<main id="thread">${turn("user", "current-user", requestId)}${turn("assistant", "current-answer", "ALL CLEAN", true)}</main>`;
  assert.deepEqual(parseBrowserReviewState(html, conversationUrl, requestBoundary(html)), {
    requestObserved: true, responseObserved: true, responseComplete: true, generating: false, answer: "ALL CLEAN",
  });
});

test("global generation state still withholds a locally completed response", () => {
  const html = `<main id="thread">${turn("user", "current-user", requestId)}${turn("assistant", "current-answer", "partial", true)}<button data-testid="stop-button"></button></main>`;
  assert.equal(parseBrowserReviewState(html, conversationUrl, requestBoundary(html)).generating, true);
});

test("adoption binds a manual review to its exact message and conversation URL", () => {
  const html = `<main id="thread">${turn("user", "manual-user", "Review owner/repo PR #9")}${turn("assistant", "manual-answer", "one finding", true)}</main>`;
  const boundary = bindReviewBoundary(html, conversationUrl, parseReviewBoundary(createAdoptionToken(html, conversationUrl)));
  assert.equal(parseBrowserReviewState(html, conversationUrl, boundary).answer, "one finding");
  assert.throws(() => parseBrowserReviewState(html, "https://chatgpt.com/c/another", boundary), /conversation URL changed/);
});

test("a bound Mux request fails loudly when the surface changes conversations", () => {
  const html = `<main id="thread">${turn("user", "current-user", requestId)}${turn("assistant", "answer", "clean", true)}</main>`;
  const boundary = requestBoundary(html);
  assert.throws(() => parseBrowserReviewState(html, "https://chatgpt.com/c/another", boundary), /conversation URL changed/);
});

test("request binding waits for the turn and two stable URL observations", () => {
  const tracker = new RequestBoundaryTracker();
  const request = parseReviewBoundary(requestId);
  assert.equal(request.kind, "unbound-request");
  const empty = '<main id="thread"></main>';
  const html = `<main id="thread">${turn("user", "current-user", requestId)}</main>`;
  assert.equal(tracker.observe(empty, "https://chatgpt.com/", request), undefined);
  assert.equal(tracker.observe(html, "https://chatgpt.com/", request), undefined);
  assert.equal(tracker.observe(html, conversationUrl, request), undefined);
  assert.equal(tracker.observe(html, conversationUrl, request)?.conversationUrl, conversationUrl);
});

test("ready records preserve the settled digest and exact turn boundary", () => {
  const html = `<main id="thread">${turn("user", "current-user", requestId)}</main>`;
  const boundary = requestBoundary(html);
  assert.deepEqual(parseReadyRecord(serializeReadyRecord(boundary, "a".repeat(64))), {
    boundary,
    digest: "a".repeat(64),
  });
});

test("adoption is read-only and polling scripts contain no browser evaluation", () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const adoption = readFileSync(path.join(directory, "chatgpt-review-adopt.ts"), "utf8");
  const transport = readFileSync(path.join(directory, "chatgpt-review-transport.ts"), "utf8");
  const common = readFileSync(path.join(directory, "review-common.sh"), "utf8");
  assert.doesNotMatch(adoption, /navigate|new chat|review_submit/i);
  assert.doesNotMatch(`${transport}\n${common}`, /browser-eval|browser[^\n]* eval /i);
});
