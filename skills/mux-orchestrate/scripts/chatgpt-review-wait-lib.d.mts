export interface ReviewWaitOptions {
  poll: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  onStatus: (message: string) => void;
  pollIntervalMs: number;
  statusIntervalMs: number;
  requestId: string;
}

export function hasReviewCompletionEvidence(output: string, requestId: string): boolean;
export function waitForChatGptReview(options: ReviewWaitOptions): Promise<string>;
