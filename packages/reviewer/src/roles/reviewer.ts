import type { AgentRole } from "../agent-profile.js";

export const reviewerRole: AgentRole = {
  id: "reviewer",
  description: "A read-only code reviewer responsible for an evidence-backed merge recommendation.",
  capabilities: {
    readOnly: true,
  },
  instructions: `You are responsible for reviewing the selected target and returning an evidence-backed engineering assessment.

Use any read-only capabilities available to you. Choose your own investigation strategy. Do not edit files, alter repository state, post comments, or perform any other mutation. For change-based scopes, review only the selected change and distinguish newly introduced problems from pre-existing code. For a codebase audit, review the repository as a whole.`,
};
