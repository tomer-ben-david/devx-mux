import assert from "node:assert/strict";
import test from "node:test";
import { hasReviewCompletionEvidence, waitForChatGptReview } from "./chatgpt-review-wait-lib.mjs";

const requestId = "REQUEST_ID=github:owner/repo:pr:9:head:0123456789abcdef0123456789abcdef01234567:20260716T100000+0300";
const cleanReview = "Reviewed exact head 0123456789abcdef0123456789abcdef01234567. Verdict: all clean.";

test("the shared waiter settles an identical result across three polls before returning it", async () => {
  const outputs = ["waiting response", "REQUEST", "partial review", cleanReview, cleanReview, cleanReview];
  const statuses: string[] = [];
  let now = 0;

  const result = await waitForChatGptReview({
    poll: () => outputs.shift() ?? "unexpected",
    sleep: async milliseconds => { now += milliseconds; },
    now: () => now,
    onStatus: message => statuses.push(message),
    pollIntervalMs: 60_000,
    statusIntervalMs: 300_000,
    requestId,
  });

  assert.equal(result, cleanReview);
  assert.deepEqual(statuses, [`waiting ChatGPT review elapsed=5m polls=5 settling=2/3 ${requestId}`]);
});

test("the shared waiter emits a five-minute heartbeat and has no elapsed-time timeout", async () => {
  const statuses: string[] = [];
  let now = 0;
  let polls = 0;

  const result = await waitForChatGptReview({
    poll: () => {
      polls += 1;
      return polls >= 7 ? cleanReview : "waiting generating";
    },
    sleep: async milliseconds => { now += milliseconds; },
    now: () => now,
    onStatus: message => statuses.push(message),
    pollIntervalMs: 60_000,
    statusIntervalMs: 300_000,
    requestId,
  });

  assert.equal(result, cleanReview);
  assert.deepEqual(statuses, [`waiting ChatGPT review elapsed=5m polls=5 ${requestId}`]);
});

test("the shared waiter fails closed on an empty poll result", async () => {
  await assert.rejects(
    waitForChatGptReview({
      poll: () => "",
      sleep: async () => {},
      now: () => 0,
      onStatus: () => {},
      pollIntervalMs: 60_000,
      statusIntervalMs: 300_000,
      requestId,
    }),
    /empty response/,
  );
});

test("completion evidence requires the exact request head and a final verdict marker", () => {
  assert.equal(hasReviewCompletionEvidence("REQUEST", requestId), false);
  assert.equal(hasReviewCompletionEvidence("Reviewed exact head 0123456789abcdef0123456789abcdef01234567", requestId), false);
  assert.equal(hasReviewCompletionEvidence("Verdict: all clean at another head", requestId), false);
  assert.equal(hasReviewCompletionEvidence(cleanReview, requestId), true);
});
