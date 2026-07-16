import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const common = path.join(path.dirname(fileURLToPath(import.meta.url)), "review-common.sh");
const commonSource = readFileSync(common, "utf8");

const requestId = "REQUEST_ID=github:owner/repo:pr:9:head:abc:20260716T100000+0300";

function poll(state: string): string {
  const script = `
    source "$COMMON"
    review_find_chatgpt_pane() { printf 'surface:1\\n'; }
    review_is_chatgpt() { return 0; }
    review_read_answer_state() { printf '%s' "$MOCK_STATE"; }
    review_poll_latest_answer cmux surface:1 "$REQUEST_ID"
  `;
  return execFileSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, COMMON: common, MOCK_STATE: state, REQUEST_ID: requestId },
  });
}

test("polling waits until the submitted request is visible", () => {
  assert.equal(
    poll('{"requestObserved":false,"responseObserved":false,"generation":"complete","answer":""}'),
    `waiting missing ${requestId}\n`,
  );
});

test("polling ignores historical assistants until one follows the request", () => {
  assert.equal(
    poll('{"requestObserved":true,"responseObserved":false,"generation":"complete","answer":""}'),
    `waiting response for ${requestId}\n`,
  );
});

test("polling withholds the request-bound response while it is generating", () => {
  assert.equal(
    poll('{"requestObserved":true,"responseObserved":true,"generation":"generating","answer":"partial finding"}'),
    `waiting generating ${requestId}\n`,
  );
});

test("polling returns only a completed response following the request", () => {
  assert.equal(
    poll('{"requestObserved":true,"responseObserved":true,"generation":"complete","answer":"ALL CLEAN"}'),
    "ALL CLEAN\n",
  );
});

test("polling preserves and waits for an empty completed response", () => {
  assert.equal(
    poll('{"requestObserved":true,"responseObserved":true,"generation":"complete","answer":""}'),
    `waiting empty ${requestId}\n`,
  );
});

test("polling fails closed on empty or malformed structured state", () => {
  assert.throws(() => poll(""));
  assert.throws(() => poll('{"requestObserved":"yes","responseObserved":true,"generation":"complete","answer":"x"}'));
  assert.throws(() => poll('{"requestObserved":true,"responseObserved":true,"generation":"unknown","answer":"x"}'));
});

test("generation detection supports both ChatGPT stop-button representations", () => {
  assert.match(commonSource, /data-testid=\\?"stop-button/);
  assert.match(commonSource, /Stop answering/);
});
