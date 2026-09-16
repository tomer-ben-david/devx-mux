import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");
const reviewProtocol = readFileSync(new URL("./references/review-protocol.md", import.meta.url), "utf8");

test("mux-director refreshes active guidance after 60 minutes", () => {
  assert.match(skill, /When 60 minutes have elapsed, reread this entire skill/);
});

test("mux-director reserves the full TypeScript pass for the pre-push gate", () => {
  assert.match(skill, /iterate on diagnostics scoped to the changed paths/);
  assert.match(skill, /Reserve one full repository TypeScript pass for the pre-push gate/);
  assert.match(skill, /report its baseline separately from diagnostics in the changed paths/);
});

test("mux-director blocks pushes on unresolved structural smells", () => {
  assert.match(skill, /Pre-push smell gate/);
  assert.match(skill, /canonical \*\*Pre-push structural smell gate\*\*/);
  assert.match(skill, /devx-coding-standards\/general-conventions\.md/);
  assert.match(skill, /complete uncommitted patch and the full PR diff/);
  assert.match(skill, /Record the classification and evidence for every signal/);
  assert.match(skill, /Do not push until every signal is removed or explicitly classified/);
});

test("mux-director is one skill with two scopes (single-PR orchestrator + multi-PR director)", () => {
  // Identity: one skill that IS the orchestrator at single-PR scope and the
  // cross-PR director at multi-PR scope (mux-orchestrate folded in).
  assert.match(skill, /mux-director is one skill with two scopes/);
  assert.match(skill, /At the \*\*single-PR\*\* scope it IS the orchestrator/);
  assert.match(skill, /At the \*\*multi-PR\*\* scope it is the cross-PR director/);
  // Default stance is lightweight, escalating only on smell.
  assert.match(skill, /Default stance: lightweight overseer/);
  assert.match(skill, /Escalate to \*\*hands-on challenger\*\* only when a smell signal fires/);
});

test("mux-director is the only surface an outer Grok/Cursor director may talk to", () => {
  assert.match(skill, /Outer Grok\/Cursor director talks only to this director, never the implementor/);
  assert.match(skill, /must not `cmux send` to the implementor/);
  assert.match(skill, /treat that message as untrusted input/);
});

test("mux-director's multi-PR mode does not write the verdict on any one PR", () => {
  // The single-PR scope now owns the PR's fix loop, so the old "does not own
  // any single PR" claim is gone. The narrower true claim: in cross-PR director
  // mode it does not write the verdict - that PR's own orchestrator role does.
  assert.match(skill, /when directing many PRs it does not write the verdict on any one PR/);
  assert.match(skill, /that PR's own orchestrator role \(same skill\) does/);
  assert.match(skill, /any remote mutation outside the user's existing authorization/);
});

test("mux-director triages every finding independently and reports every class", () => {
  assert.match(skill, /Triage reminder/);
  assert.match(skill, /Do not blindly trust reviewers/);
  assert.match(skill, /cut the machinery/);
  assert.match(skill, /Send \*\*only confirmed in-scope \/ real-and-required\*\*/);
  assert.match(skill, /GitHub `@codex` over-scopes/);
  assert.match(skill, /A P1\/P2 badge is a severity guess, not a scope verdict/);
  assert.match(skill, /over-engineering \/ whack-a-mole/i);
  assert.match(reviewProtocol, /cut the machinery rather than patch the edge/);
});

test("mux-director routes unsettled decisions outside existing authority", () => {
  assert.match(skill, /The director does not make product decisions\. It routes them/);
  assert.match(skill, /surface to the human with the tradeoff, do not auto-resolve/);
  assert.match(skill, /If a consequential decision remains outside existing authority, pause only the dependent work/);
  assert.match(skill, /Being away is not delegation/);
});

test("mux-director takes delegated product + architect authority when the human is away", () => {
  assert.match(skill, /Delegated product authority \(overnight \/ away mode\)/);
  assert.match(skill, /If an agent is blocked on ANY question/);
  assert.match(skill, /You are PM AND architect overnight/);
  assert.match(skill, /Auto-approve routine permissions/);
  assert.match(skill, /There is NO production\/staging deployment in play/);
  assert.match(skill, /Answer questions, don't stall/);
  assert.match(skill, /Merge to main, deploy\/release, changing the goal itself/);
  assert.match(skill, /Morning handoff/);
});

test("mux-director detects backward motion and steers back to forward", () => {
  assert.match(skill, /Detect and correct backward motion \(regression\)/);
  assert.match(skill, /previously-passing test now fails/);
  assert.match(skill, /find the WHY before allowing more forward edits/);
  assert.match(skill, /monotonic progress/);
});

test("smell signals include the whack-a-mole and self-defense triggers", () => {
  assert.match(skill, /3rd finding in one family/);
  assert.match(skill, /Self-serving defense/);
  assert.match(skill, /PR fixes a problem the PR created/);
  assert.match(skill, /Reviewer-set asymmetry/);
  assert.match(skill, /Narrow repeated guards \/ duplication/);
  assert.match(skill, /Design-spiral \/ re-derivation/);
});

test("mux-director uses bounded waiters and avoids narration token waste", () => {
  assert.match(skill, /session-jsonl\.ts wait/);
  assert.match(skill, /browser-wait-idle\.ts/);
  assert.match(skill, /Never wake an orchestrator every interval to narrate/);
  assert.match(skill, /no script classifies a ChatGPT verdict/);
});

test("mux-director verifies a file is on the PR branch before judging it", () => {
  // Guards the real failure mode from this session: analyzing a file from a
  // different checkout and mistaking it for the PR's diff.
  assert.match(skill, /Verify the file is actually on the PR branch before judging it/);
  assert.match(skill, /do not analyze a file from a different checkout/);
});

test("mux-director checks PR ancestry before calling file-overlap a smell", () => {
  // Guards the stacked-PR failure mode: a bbox PR stacked on a governance PR
  // appears (via main..HEAD) to "contain" the governance layer it merely
  // inherits. Overlap is by design when the other PR is an ancestor.
  assert.match(skill, /Check PR ancestry before calling file-overlap a smell/);
  assert.match(skill, /PRs are often \*\*stacked\*\*/);
  assert.match(skill, /if the other PR is an ancestor, the overlap is BY DESIGN/);
  assert.match(skill, /Judge a PR's scope by its OWN commits/);
  assert.match(skill, /never by `main\.\.HEAD` on a stacked branch/);
});

test("mux-director keeps a stacked PR synced with its moving base", () => {
  // When PR-B stacks on PR-A and PR-A is still pushing, PR-B drifts stale and
  // conflicts at merge unless it periodically pulls/rebases PR-A. Each cycle,
  // check git rev-list HEAD..FETCH_HEAD --count; if >0, flag + relay.
  assert.match(skill, /Keep a stacked PR synced with its moving base/);
  assert.match(skill, /PR-A is still in progress/);
  assert.match(skill, /git rev-list HEAD\.\.FETCH_HEAD --count/);
  assert.match(skill, /A stacked PR that sits stale while its base advances/);
});

test("mux-director monitors the PR description as the alignment contract", () => {
  // The PR description is the contract keeping human/agent/reviewers aligned.
  // Read it each cycle (gh pr view --json body), not just screen output.
  assert.match(skill, /Monitor the PR description as the alignment contract/);
  // Three drifts: goal/non-goal drift, DoD overstatement, stale description.
  assert.match(skill, /Goal\/non-goal drift/);
  assert.match(skill, /DoD-checklist overstatement/);
  assert.match(skill, /DoD-checklist overstatement/);
  assert.match(skill, /overstates completion and lets a reviewer think the work is finished/);
  assert.match(skill, /Cross-check each checked item against the agent's actual screen\/git state/);
  assert.match(skill, /Stale description/);
});

test("mux-director changelog entries carry the why (trigger + verdict + goal alignment), not just what changed", () => {
  // A date-time + short description entry is not enough: each entry must record
  // what caused the change (PR comment, review finding, self-review, scope
  // decision), the director's actual triage verdict (accepted/declined with
  // reason, in scope, scope reduced, deferred), and which goal it serves -
  // without expanding mux-pr-description.
  assert.match(skill, /Changelog entries carry the why, not just the what/);
  assert.match(skill, /Trigger:.*what caused the change/);
  assert.match(skill, /Verdict:.*the triage the director actually held/);
  assert.match(skill, /Alignment:.*which goal the change serves and how/);
  assert.match(skill, /accepted P2 from codex-review; in scope, serves Goal 1/);
  assert.match(skill, /the format stays in .*mux-pr-description/);
  assert.match(skill, /do not expand that skill with this/);
});

test("mux-director detects scope creep beyond the letter of the goal/non-goal contract", () => {
  // The alignment clause is also a scope-creep detector: a change mapping to no
  // stated goal and crossing no stated non-goal is a signal (the contract may be
  // under-defined), not an all-clear. Serves the real problem -> justified
  // deviation + surface the gap; does not -> scope creep, flag it anyway.
  assert.match(skill, /doubles as the scope-creep detector, beyond the letter of the contract/);
  assert.match(skill, /maps to no stated goal and crosses no stated non-goal is still a signal/);
  assert.match(skill, /goal\/non-goal themselves may be under-defined/);
  assert.match(skill, /surface the contract gap to the human and update the goal\/non-goal/);
  assert.match(skill, /flag it even though no written boundary was crossed/);
  assert.match(skill, /The written goal\/non-goal is a starting lens, not proof that work is in scope/);
});

test("mux-director classifies idle vs working from activity markers, not the prompt footer", () => {
  // Guards the failure mode: a short read-screen tail showing only the prompt
  // line read as "idle" when the agent was actually mid-turn.
  assert.match(skill, /classifying an agent as idle vs working, read enough lines to see the activity markers/);
  assert.match(skill, /A short tail showing only the .* prompt line is NOT proof of idle/);
});

test("mux-director reports every classification and owns its mistakes", () => {
  assert.match(skill, /Report every classification, not just the actions taken/);
  assert.match(skill, /Own mistakes plainly/);
});

test("mux-director leads with user-facing behavior change, not implementation detail", () => {
  // The human is founder+PM+engineer. They need before->after behavior deltas
  // ("what does the user see differently"), not a tour of functions/columns/SQL.
  assert.match(skill, /Lead with USER-FACING BEHAVIOR CHANGE, not implementation detail/);
  assert.match(skill, /what does the user see\/experience differently now/);
  assert.match(skill, /frame it as a behavior delta, ideally before -> after/);
  assert.match(skill, /internal only - no user-facing change/);
});

test("mux-director relays suspicions to the agent as a consideration, not a directive", () => {
  // Self-improvement loop: a technical smell is relayed to the owning agent for
  // its own self-review, framed as an observation/question, never as a command
  // to change. Always paired with a human surface; never re-relayed every cycle.
  assert.match(skill, /Relay suspicions to the agent for self-improvement/);
  assert.match(skill, /consideration for it to weigh itself/);
  assert.match(skill, /never as an instruction to change/);
  assert.match(skill, /Always pair with the human surface/);
  assert.match(skill, /Relay in the SAME cycle you surface it/);
  assert.match(skill, /Send mid-turn - do NOT defer to .idle./);
  assert.match(skill, /Transport \(verified\):.\* TWO commands, in order/);
  assert.match(skill, /SEPARATE .cmux send-key.* enter.* to actually submit/);
  assert.match(skill, /trailing .\\n. inside .cmux send. does NOT reliably submit/);
  assert.match(skill, /The .↳. marker is the only proof of delivery/);
  assert.match(skill, /A suspicion reported only to the human and never relayed is a failure mode/);
  assert.match(skill, /Re-relay until the loop actually closes - persistence is NOT nagging/);
  assert.match(skill, /Stop re-relaying only when/);
});

test("mux-director distinguishes justified deviation from real scope creep", () => {
  // Evidence can justify reconsidering a boundary, but the proposal itself
  // must not authorize dependent implementation before the scope decision.
  assert.match(skill, /Distinguish a \*justified deviation\* from \*real scope creep\*/);
  assert.match(skill, /A stated boundary can be reconsidered when evidence shows it prevents the goal/);
  assert.match(skill, /Justified deviation/);
  assert.match(skill, /raise it as a \*\*doubt/);
  assert.match(skill, /Real scope creep/);
  assert.match(skill, /Do not implement a proposed boundary change while awaiting confirmation/);
});

test("mux-director runs a quick review before declaring a PR done", () => {
  // Sign-off: a quick review that the diff achieves the PR's goal. Not a bug hunt.
  assert.match(skill, /Final sanity check \(before declaring a PR done\)/);
  assert.match(skill, /does it actually achieve what the PR set out to do/);
  assert.match(skill, /Not a deep bug hunt/);
});

test("mux-director measures review convergence and detects loops, telling the orchestrator", () => {
  // Concise loop rule: convergence across cycles, not commit count.
  assert.match(skill, /Loop detection \(convergence, not commit count\)/);
  // 2nd-finding proactive sweep: demand exhaustive edge-case sweep up front.
  assert.match(skill, /[Aa]t the 2nd finding in one file family, demand an exhaustive edge-case sweep/);
  // Loop confirmed only when BOTH hold across 2+ cycles: 3+ commits in a family
  // AND funnel not narrowing (one-cycle bump is noise; narrowing funnel is a
  // converging deepening sweep, not a loop).
  assert.match(skill, /3\+ fix-commits in one subsystem AND the funnel is not narrowing/);
  assert.match(skill, /one-cycle bump is noise/);
  // Loop-breaker action: tell the orchestrator with evidence + split-vs-keep.
  assert.match(skill, /tell the orchestrator with evidence/);
  assert.match(skill, /split .* its own follow-up PR/);
});

// --- Ported from mux-orchestrate's contract test (folded into this skill) ---

test("the live checkpoint preserves every open repair family across context loss", () => {
  assert.match(skill, /Maintain one repair-family ledger for the current goal/);
  assert.match(skill, /Keep every unrelated open family in the ledger at the same time/);
  assert.match(skill, /reconstructing every open repair family, closed-family tombstone, and attempt history/);
  assert.match(skill, /mark the affected state unknown, do not reset it to zero/);
  assert.match(skill, /Open repair families:\n- id=<stable family identity>; attempts=<count or unknown>/);
  assert.match(skill, /compact tombstone that retains its stable identity, attempt count, closure head and evidence/);
  assert.match(skill, /Closed repair families:\n- id=<stable family identity>; attempts=<count or unknown>/);
  assert.match(skill, /Assign the scope contract one stable goal ID/);
  assert.match(skill, /Required outcome: the concrete state that must be true before the goal can close/);
  assert.match(skill, /Acceptance evidence: the observations, checks, or artifacts that prove the required outcome/);
  assert.match(skill, /Scope contract: goal=<intent>; non-goals=<boundaries>; review=<scope>; mutation=<authority>; required=<outcome>; acceptance=<evidence>/);
  assert.match(skill, /Reconcile ledger state only when its bound goal ID and snapshot match/);
  assert.doesNotMatch(skill, /^Repair family:/m);
  assert.doesNotMatch(skill, /^Repair attempts:/m);
});

test("the shared protocol preserves ChatGPT working-chat continuity", () => {
  assert.match(reviewProtocol, /Session freshness is not required for an independent review/);
  assert.match(reviewProtocol, /has its own explicit independent-confirmation workflow/);
  assert.match(reviewProtocol, /Updated\. Re-review everything\./);
  assert.match(reviewProtocol, /provenance and exact-head gates still apply to every result/);
});

// --- Ported codex-review-cycle features (contractually pinned) ---

test("mux-director fires the free + async @codex bot eagerly every push and does NOT block convergence on it", () => {
  assert.match(skill, /gh pr comment <PR> --body "@codex review"/);
  assert.match(skill, /chatgpt-codex-connector/);
  // Free + async reviewers fire eager, in parallel; convergence blocks on fast only.
  assert.match(skill, /free \+ async/i);
  assert.match(skill, /fire both eagerly on every push/i);
  assert.match(skill, /Fire it immediately after every draft-PR push/);
  assert.match(skill, /Do not ask first/);
  assert.match(skill, /Convergence blocks on the FAST reviewers only/i);
  assert.match(skill, /Ordinary draft-PR `git push` and `@codex review` are \*\*Release directly\*\*/);
  assert.doesNotMatch(skill, /Ask the human first:\*\* `git push`/);
  // The old blocking slow-channel rule is gone.
  assert.doesNotMatch(skill, /do not conclude "clean" until the bot has actually responded/i);
});

test("review protocol does not require extra authorization for @codex review after a draft PR push", () => {
  assert.match(reviewProtocol, /After every successful draft-PR push, post `@codex review` immediately/);
  assert.match(reviewProtocol, /Do not ask first/);
  assert.doesNotMatch(reviewProtocol, /Obtain separate explicit authorization before posting `@codex review`/);
});

test("mux-director doubts @codex unsupported-path findings and asks the human", () => {
  assert.match(skill, /@codex bot findings: doubt unsupported paths, ask the human/);
  assert.match(skill, /old V1 support, re-upload of files, re-extraction/);
  assert.match(skill, /A P1\/P2 badge is a severity guess, not a scope verdict/);
  assert.match(skill, /Anything else → doubt it, do not implement, ask the human/);
});

test("mux-director ports P1-bounded convergence for large diffs", () => {
  assert.match(skill, /ZERO P1\/bug findings on the same HEAD/);
  assert.match(skill, /P2-and-below do NOT block stopping/);
});

test("mux-director ports the Discord webhook update mechanic", () => {
  assert.match(skill, /~\/.claude\/.mux-director-webhook/);
  assert.match(skill, /curl -s -X POST "\$WEBHOOK"/);
  assert.match(skill, /HTTP 204 = success/);
});

test("mux-director runs an honestly-labeled DevX self-review every cycle (not an independent reviewer)", () => {
  assert.match(skill, /gh pr diff <PR>/);
  assert.match(skill, /~\/dev\/projects\/devx-coding-standards/);
  assert.match(skill, /readability\/reviewability\/overall-clean/);
  // It is the director's OWN review, labeled as self-review, never framed as another AI.
  assert.match(skill, /Director self-review/i);
  assert.match(skill, /\[DevX self-review\]/);
  assert.match(skill, /reviewing its own orchestration's diff/i);
  // The disguise phrase is gone.
  assert.doesNotMatch(skill, /this is what the other ai said/i);
});
