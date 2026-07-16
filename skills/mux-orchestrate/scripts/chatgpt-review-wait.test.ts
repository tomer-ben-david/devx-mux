import assert from "node:assert/strict";
import test from "node:test";
import { waitForChatGptReview } from "./chatgpt-review-wait.ts";

test("the shared waiter polls internally and reports status only every five minutes", async () => {
  const outputs = ["waiting response", "waiting generating", "waiting generating", "ALL CLEAN"];
  const statuses: string[] = [];
  let now = 0;

  const result = await waitForChatGptReview({
    poll: () => outputs.shift() ?? "unexpected",
    sleep: async milliseconds => { now += milliseconds; },
    now: () => now,
    onStatus: message => statuses.push(message),
    pollIntervalMs: 60_000,
    statusIntervalMs: 300_000,
    requestId: "REQUEST_ID=test",
  });

  assert.equal(result, "ALL CLEAN");
  assert.deepEqual(statuses, []);
});

test("the shared waiter emits a five-minute heartbeat and has no elapsed-time timeout", async () => {
  const statuses: string[] = [];
  let now = 0;
  let polls = 0;

  const result = await waitForChatGptReview({
    poll: () => ++polls === 7 ? "review result" : "waiting generating",
    sleep: async milliseconds => { now += milliseconds; },
    now: () => now,
    onStatus: message => statuses.push(message),
    pollIntervalMs: 60_000,
    statusIntervalMs: 300_000,
    requestId: "REQUEST_ID=test",
  });

  assert.equal(result, "review result");
  assert.deepEqual(statuses, ["waiting ChatGPT review elapsed=5m polls=5 REQUEST_ID=test"]);
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
      requestId: "REQUEST_ID=test",
    }),
    /empty response/,
  );
});
