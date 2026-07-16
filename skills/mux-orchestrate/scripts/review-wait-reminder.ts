#!/usr/bin/env node

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const [targetIdentity, delayArgument = "300", ...extraArguments] = process.argv.slice(2);
if (targetIdentity === undefined || extraArguments.length > 0) {
  fail("Usage: review-wait-reminder.ts <stable-target-identity> [seconds]");
}

const delaySeconds = Number(delayArgument);
if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
  fail(`Delay must be a non-negative integer: ${delayArgument}`);
}

await new Promise<void>((resolve) => setTimeout(resolve, delaySeconds * 1_000));
process.stdout.write(
  `Review exists on ${targetIdentity} and is ready for the agent to check now. `
  + "Completion is unknown; this script did not inspect it.\n",
);
process.exitCode = 0;
