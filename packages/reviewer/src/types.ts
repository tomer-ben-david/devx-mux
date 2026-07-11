export type ReviewScope =
  | { readonly kind: "branch"; readonly base: string }
  | { readonly kind: "commit"; readonly ref: string }
  | { readonly kind: "local" };

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
  review(prompt: string, repositoryPath: string): Promise<number>;
}

