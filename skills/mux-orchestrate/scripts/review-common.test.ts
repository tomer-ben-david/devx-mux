import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const common = path.join(path.dirname(fileURLToPath(import.meta.url)), "review-common.sh");

function poll(state: string, afterCount: number): string {
  const script = `
    source "$COMMON"
    review_find_chatgpt_pane() { printf 'surface:1\\n'; }
    review_is_chatgpt() { return 0; }
    review_read_answer_state() { printf '%s' "$MOCK_STATE"; }
    review_poll_latest_answer cmux surface:1 "" "$AFTER_COUNT"
  `;
  return execFileSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, COMMON: common, MOCK_STATE: state, AFTER_COUNT: String(afterCount) },
  });
}

test("polling waits for an assistant message after the captured prompt boundary", () => {
  assert.equal(poll("1\ncomplete\nhistorical", 1), "waiting assistant_count=1 after=1\n");
});

test("polling withholds a newer assistant message while it is generating", () => {
  assert.equal(poll("2\ngenerating\npartial finding", 1), "waiting generating assistant_count=2\n");
});

test("polling returns only a completed assistant message after the boundary", () => {
  assert.equal(poll("2\ncomplete\nALL CLEAN", 1), "ALL CLEAN\n");
});
