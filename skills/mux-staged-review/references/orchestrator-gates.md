# Orchestrator gates

## Sequential gate

Run exactly one review stage per send:

```text
Stage 1 clean
  -> Stage 2 clean
     -> Stage 3 clean
        -> Stage 4 clean
```

Do not batch stages or advance while a finding remains unresolved.

## Neutral prompts

Render the fixed stage template with only current factual values: request ID, PR URL, compare URL, base, branch, head, and commit subject.

Do not add prior findings, fix summaries, suggested conclusions, pasted diffs, or targeted hints to a fresh-stage prompt. The reviewer must form a new opinion from the current pushed source.

## Scope

- Stage 1 reviews only the latest commit.
- Stage 2 reviews the entire branch-introduced functional diff.
- Stage 3 reviews only branch-introduced standards, clarity, and readability concerns.
- Stage 4 reviews the complete PR for production risk and final merge confidence.

Use the PR base or a Git-derived merge base. Never hardcode a default branch name.

## Repeat until clean

1. Send one stage prompt.
2. Wait about five minutes without browser interaction, then inspect the same browser target directly.
3. If ChatGPT is still working or the response is incomplete, wait another five minutes and inspect again.
4. Triage every finding.
5. If code changes, validate and push with explicit approval.
6. Rerun the same stage at the new head.
7. Advance only after the current stage is clean.

Do not treat an interrupted or partial response as clean.

## Browser boundary

The browser reviews pushed GitHub source. Provide a PR or compare URL, not a pasted patch. If the branch is not pushed or the page cannot read the source, stop and report the blocker.

Sending a review request does not authorize a push, PR edit, thread resolution, bot trigger, merge, or deploy.
