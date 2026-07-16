/**
 * @typedef {object} ReviewWaitOptions
 * @property {() => string} poll
 * @property {(milliseconds: number) => Promise<void>} sleep
 * @property {() => number} now
 * @property {(message: string) => void} onStatus
 * @property {number} pollIntervalMs
 * @property {number} statusIntervalMs
 * @property {string} requestId
 */

/** @param {string} output @param {string} requestId */
export function hasReviewCompletionEvidence(output, requestId) {
  const expectedHead = requestId.match(/:head:([0-9a-f]{40}):/i)?.[1];
  if (!expectedHead || !output.toLowerCase().includes(expectedHead.toLowerCase())) {
    return false;
  }
  return /\bverdict\b|\ball clean\b|\bno actionable findings?\b|\bnot clean\b/i.test(output);
}

/** @param {ReviewWaitOptions} options @returns {Promise<string>} */
export async function waitForChatGptReview(options) {
  const startedAt = options.now();
  let nextStatusAt = startedAt + options.statusIntervalMs;
  let polls = 0;
  let candidate = "";
  let candidatePolls = 0;

  for (;;) {
    await options.sleep(options.pollIntervalMs);
    const output = options.poll().trimEnd();
    polls += 1;

    if (!output) {
      throw new Error("ChatGPT review poll returned an empty response");
    }
    if (output.startsWith("waiting ") || !hasReviewCompletionEvidence(output, options.requestId)) {
      candidate = "";
      candidatePolls = 0;
    } else if (output === candidate) {
      candidatePolls += 1;
    } else {
      candidate = output;
      candidatePolls = 1;
    }
    if (candidatePolls >= 3) {
      return candidate;
    }

    const currentTime = options.now();
    if (currentTime >= nextStatusAt) {
      const elapsedMinutes = Math.floor((currentTime - startedAt) / 60_000);
      const settling = candidatePolls > 0 ? ` settling=${candidatePolls}/3` : "";
      options.onStatus(`waiting ChatGPT review elapsed=${elapsedMinutes}m polls=${polls}${settling} ${options.requestId}`);
      nextStatusAt = currentTime + options.statusIntervalMs;
    }
  }
}
