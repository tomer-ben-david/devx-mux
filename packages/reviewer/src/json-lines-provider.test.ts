import assert from "node:assert/strict";
import test from "node:test";
import { runJsonLinesProvider } from "./json-lines-provider.js";

test("consumes a final structured event without a trailing newline", async () => {
  const events: unknown[] = [];
  const execution = await runJsonLinesProvider(
    process.execPath,
    ["-e", 'process.stdout.write(JSON.stringify({ type: "done" }))'],
    "Fixture",
    (line) => events.push(line.value),
  );

  assert.equal(execution.exitCode, 0);
  assert.deepEqual(events, [{ type: "done" }]);
});

test("fails loudly when structured provider output is malformed", async () => {
  await assert.rejects(
    runJsonLinesProvider(
      process.execPath,
      ["-e", 'process.stdout.write("not-json\\n")'],
      "Fixture",
      () => undefined,
    ),
    /Fixture emitted malformed structured output/,
  );
});
