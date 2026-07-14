export interface ReviewCancellation {
  readonly signal: AbortSignal;
  cancel(): void;
}

export async function withReviewCancellation<Result>(
  execute: (cancellation: ReviewCancellation) => Promise<Result>,
): Promise<Result> {
  const controller = new AbortController();
  const cancel = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };
  const cancellation = { signal: controller.signal, cancel };
  process.on("SIGINT", cancel);
  try {
    return await execute(cancellation);
  } finally {
    process.off("SIGINT", cancel);
  }
}
