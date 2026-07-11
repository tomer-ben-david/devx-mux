export type ReviewScope =
  | { readonly kind: "pr"; readonly number?: number; readonly base: string }
  | { readonly kind: "branch"; readonly base: string }
  | { readonly kind: "commit"; readonly ref: string }
  | { readonly kind: "local" }
  | { readonly kind: "codebase" };

export interface ReviewRequest {
  readonly scope: ReviewScope;
  readonly standardsReference: string;
}

export interface ReviewProvider {
  readonly name: string;
  version(): Promise<string>;
  configuration?(repositoryPath: string): Promise<ReviewProviderConfiguration>;
  review(
    prompt: string,
    repositoryPath: string,
    onProgress?: (update: ReviewProgress) => void,
  ): Promise<ReviewExecutionResult>;
}

export interface ReviewProviderConfiguration {
  readonly model?: string;
  readonly reasoningEffort?: string;
}

export interface ReviewProgress {
  readonly status: string;
  readonly kind?: "reasoning" | "tool" | "message";
  readonly text?: string;
}

export interface ReviewExecutionResult {
  readonly exitCode: number;
  readonly finalText: string;
  readonly error?: string;
  readonly usage?: ReviewUsage;
}

export interface ReviewUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
}
