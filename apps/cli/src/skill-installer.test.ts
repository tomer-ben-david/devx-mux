import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { installPublicSkills, PUBLIC_SKILL_NAMES } from "./skill-installer.js";

test("rejects overlapping skill sources and destinations before mutating any skill root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devx-mux-overlap-"));
  try {
    const skillsSourceRoot = path.join(root, "skills");
    for (const skillName of PUBLIC_SKILL_NAMES) {
      const source = path.join(skillsSourceRoot, skillName);
      mkdirSync(source, { recursive: true });
      writeFileSync(path.join(source, "SKILL.md"), `# ${skillName}\n`);
    }

    const claudeHome = path.join(root, "claude-home");
    const agentsHome = path.join(root, "agents-home");
    assert.throws(
      () => installPublicSkills({
        environment: {
          CODEX_HOME: root,
          CLAUDE_HOME: claudeHome,
          AGENTS_HOME: agentsHome,
        },
        skillsSourceRoot,
      }),
      /source and destination overlap/,
    );

    for (const skillName of PUBLIC_SKILL_NAMES) {
      assert.match(readFileSync(path.join(skillsSourceRoot, skillName, "SKILL.md"), "utf8"), new RegExp(skillName));
    }
    assert.equal(existsSync(path.join(claudeHome, "skills")), false);
    assert.equal(existsSync(path.join(agentsHome, "skills")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
