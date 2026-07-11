export type ReviewScope =
  | { readonly kind: "branch"; readonly base: string }
  | { readonly kind: "commit"; readonly ref: string }
  | { readonly kind: "local" }
  | { readonly kind: "codebase" };

export interface ReviewRequest {
  readonly repositoryPath: string;
  readonly repositoryName: string;
  readonly head: string;
  readonly scope: ReviewScope;
  readonly standardsReference: string;
  readonly repositoryInstructions: readonly string[];
}

export interface ReviewProvider {
  readonly name: string;
  review(
    prompt: string,
    repositoryPath: string,
    onProgress?: (detail: string) => void,
  ): Promise<ReviewExecutionResult>;
}

export interface ReviewExecutionResult {
  readonly exitCode: number;
  readonly finalText: string;
  readonly error?: string;
}
