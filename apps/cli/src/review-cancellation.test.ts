import assert from "node:assert/strict";
import test from "node:test";
import { withReviewCancellation } from "./review-cancellation.js";

test("shared review cancellation owns one signal and always removes its SIGINT listener", async () => {
  const baselineListeners = new Set(process.listeners("SIGINT"));

  await withReviewCancellation(async (cancellation) => {
    const lifecycleListeners = process.listeners("SIGINT").filter((listener) => !baselineListeners.has(listener));
    assert.equal(lifecycleListeners.length, 1);
    lifecycleListeners[0]?.("SIGINT");
    assert.equal(cancellation.signal.aborted, true);
  });
  assert.deepEqual(new Set(process.listeners("SIGINT")), baselineListeners);

  await assert.rejects(
    withReviewCancellation(async (cancellation) => {
      cancellation.cancel();
      assert.equal(cancellation.signal.aborted, true);
      throw new Error("provider failure");
    }),
    /provider failure/,
  );
  assert.deepEqual(new Set(process.listeners("SIGINT")), baselineListeners);
});
