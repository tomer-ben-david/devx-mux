import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { reviewArtifactDirectory } from "./artifacts.js";

test("uses a predictable secure per-user directory under Unix tmp", () => {
  assert.equal(reviewArtifactDirectory("darwin", 501), "/tmp/devx-crew-501");
  assert.equal(reviewArtifactDirectory("linux", 1000), "/tmp/devx-crew-1000");
});

test("uses the native temporary directory on Windows", () => {
  assert.equal(path.basename(reviewArtifactDirectory("win32")), "devx-crew");
});
