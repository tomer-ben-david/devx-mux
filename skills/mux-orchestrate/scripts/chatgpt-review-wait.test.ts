import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableBrowserPollFailure, waitForChatGptReview } from "./chatgpt-review-wait-lib.ts";

const requestId = "REQUEST_ID=staged-s1-provider-neutral";
const reviewResult = "completed provider-neutral review result";

test("the shared waiter settles an identical result across three polls before returning it", async () => {
  const outputs = ["waiting response", "partial review", reviewResult, reviewResult, reviewResult];
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

  assert.equal(result, reviewResult);
  assert.deepEqual(statuses, []);
});

test("the shared waiter emits a five-minute heartbeat and has no elapsed-time timeout", async () => {
  const statuses: string[] = [];
  let now = 0;
  let polls = 0;

  const result = await waitForChatGptReview({
    poll: () => {
      polls += 1;
      return polls >= 7 ? reviewResult : "waiting generating";
    },
    sleep: async milliseconds => { now += milliseconds; },
    now: () => now,
    onStatus: message => statuses.push(message),
    pollIntervalMs: 60_000,
    statusIntervalMs: 300_000,
    requestId,
  });

  assert.equal(result, reviewResult);
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

test("only transient browser read failures are retryable", () => {
  assert.equal(isRetryableBrowserPollFailure(new Error("browser read timed out")), true);
  assert.equal(isRetryableBrowserPollFailure(new Error("Execution context was destroyed")), true);
  assert.equal(isRetryableBrowserPollFailure(new Error("frame was detached")), true);
  assert.equal(isRetryableBrowserPollFailure(new Error("Refusing browser poll: target is not ChatGPT")), false);
  assert.equal(isRetryableBrowserPollFailure(new Error("cmux socket missing")), false);
});
