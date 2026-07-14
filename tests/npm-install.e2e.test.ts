import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const publicSkills = ["devx-mux", "mux-multireview", "mux-orchestrate", "pr-title-description", "staged-pr-review"];

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

function run(executable: string, args: readonly string[], options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {}): CommandResult {
  const result = spawnSync(executable, [...args], {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${executable} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return { stdout: result.stdout, stderr: result.stderr };
}

test("the packed npm release installs the CLI and public skills into an isolated home", { timeout: 180_000 }, () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "devx-mux-npm-install-"));
  try {
    const pack = run(npmExecutable, ["pack", "--workspace", "devx-mux", "--pack-destination", temporaryRoot, "--json"]);
    const [packageResult] = JSON.parse(pack.stdout) as Array<{
      readonly filename: string;
      readonly files: ReadonlyArray<{ readonly path: string }>;
    }>;
    assert(packageResult !== undefined);
    const packageFiles = packageResult.files.map((file) => file.path);
    assert(packageFiles.includes("dist/main.js"));
    assert(packageFiles.includes("skills/devx-mux/SKILL.md"));
    assert.equal(packageFiles.some((file) => file.includes(".test.")), false);
    assert.equal(packageFiles.some((file) => file.includes("pull-request-context")), false);

    const prefix = path.join(temporaryRoot, "prefix");
    const packagePath = path.join(temporaryRoot, packageResult.filename);
    run(npmExecutable, ["install", "--global", "--prefix", prefix, packagePath]);

    const muxExecutable = process.platform === "win32"
      ? path.join(prefix, "mux.cmd")
      : path.join(prefix, "bin", "mux");
    assert.match(run(muxExecutable, ["--version"]).stdout, /^DevX Mux 0\.1\.0$/m);

    const home = path.join(temporaryRoot, "home");
    const codexHome = path.join(home, ".codex");
    const claudeHome = path.join(home, ".claude");
    const agentsHome = path.join(home, ".agents");
    const isolatedEnvironment = {
      ...process.env,
      HOME: home,
      CODEX_HOME: codexHome,
      CLAUDE_HOME: claudeHome,
      AGENTS_HOME: agentsHome,
    };
    const firstSetup = run(muxExecutable, ["setup"], { env: isolatedEnvironment });
    assert.match(firstSetup.stdout, /Linked skill:/);
    const secondSetup = run(muxExecutable, ["setup"], { env: isolatedEnvironment });
    assert.match(secondSetup.stdout, /Skill already linked:/);

    for (const skillHome of [codexHome, claudeHome, agentsHome]) {
      for (const skillName of publicSkills) {
        const skillLink = path.join(skillHome, "skills", skillName);
        assert.equal(lstatSync(skillLink).isSymbolicLink(), true);
        assert.match(realpathSync(skillLink), /node_modules[/\\]devx-mux[/\\]skills/);
        assert.match(readFileSync(path.join(skillLink, "SKILL.md"), "utf8"), new RegExp(`name: ${skillName}`));
      }
    }

    const fixture = path.join(temporaryRoot, "fixture");
    mkdirSync(fixture);
    run("git", ["init", "--quiet"], { cwd: fixture });
    const dryRun = run(muxExecutable, ["review", "codebase", "--provider", "codex", "--dry-run", "--repo", fixture], {
      env: isolatedEnvironment,
    });
    assert.match(dryRun.stdout, /Audit the entire current repository state/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
