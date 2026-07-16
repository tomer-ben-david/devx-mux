export interface ReviewWaitOptions {
  poll: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  onStatus: (message: string) => void;
  pollIntervalMs: number;
  statusIntervalMs: number;
  requestId: string;
}

export function isRetryableBrowserPollFailure(error: unknown): boolean {
  const details = error instanceof Error
    ? `${error.message}\n${"stderr" in error ? String(error.stderr) : ""}`
    : String(error);
  return /timed out|timeout|Execution context was destroyed|frame was detached|temporarily unavailable/i.test(details);
}

export async function waitForChatGptReview(options: ReviewWaitOptions): Promise<string> {
  const startedAt = options.now();
  let nextStatusAt = startedAt + options.statusIntervalMs;
  let polls = 0;
  let candidate = "";
  let candidatePolls = 0;
  let lastWaitingState = "waiting for first poll";

  for (;;) {
    await options.sleep(options.pollIntervalMs);
    const output = options.poll().trimEnd();
    polls += 1;

    if (!output) {
      throw new Error("ChatGPT review poll returned an empty response");
    }
    if (output.startsWith("waiting ")) {
      lastWaitingState = output;
      candidate = "";
      candidatePolls = 0;
    } else if (output === candidate) {
      candidatePolls += 1;
      lastWaitingState = "settling completed response";
    } else {
      candidate = output;
      candidatePolls = 1;
      lastWaitingState = "settling completed response";
    }
    if (candidatePolls >= 3) {
      return candidate;
    }

    const currentTime = options.now();
    if (currentTime >= nextStatusAt) {
      const elapsedMinutes = Math.floor((currentTime - startedAt) / 60_000);
      const settling = candidatePolls > 0 ? ` settling=${candidatePolls}/3` : "";
      const context = lastWaitingState.includes(options.requestId) ? "" : ` ${options.requestId}`;
      options.onStatus(`waiting ChatGPT review elapsed=${elapsedMinutes}m polls=${polls}${settling} state=${lastWaitingState}${context}`);
      nextStatusAt = currentTime + options.statusIntervalMs;
    }
  }
}
