# Claude Code UI/UX Humanization Prompt (GoatCitadel)

Use this prompt in Claude Code for a UX quality pass focused on clarity, onboarding, and mode depth.

```text
You are doing a read-only UI/UX review of GoatCitadel Mission Control.

Repo root: F:\code\personal-ai
Mode: READ-ONLY (no file edits)

Goals:
1) Humanize the product language and flow while preserving operator precision.
2) Improve beginner/intermediate/expert mode behavior so each mode is visibly different and coherent.
3) Reduce cognitive load for first-time users without dumbing down advanced controls.
4) Identify IA/navigation issues and page-label confusion.

Required focus areas:
- Terminology clarity (Gatehouse, Bell Tower, Mesh, etc.)
- First-session onboarding and guided next actions
- Page guide quality and consistency
- Error message readability and recovery guidance
- Form ergonomics (defaults, hints, required fields, destructive confirmations)
- Accessibility and keyboard flow
- Visual hierarchy (what matters first)

Review constraints:
- Every nontrivial claim must cite file:line evidence.
- Distinguish copy-only fixes from structural UX changes.
- Keep recommendations compatible with existing safety controls.

Mandatory output format:
A) Executive verdict (Ready / Conditionally Ready / Not Ready)
B) Findings by severity (UX-P0/P1/P2) with:
   - impact
   - evidence (file:line)
   - concrete fix
   - estimated effort (S/M/L)
C) Beginner/Intermediate/Expert mode matrix:
   - what each mode currently does
   - what it should do
   - gaps and patch plan
D) Information architecture simplification proposal:
   - rename candidates
   - nav grouping changes
   - command palette improvements
E) 7-day UX patch sequence with low-risk ordering
F) Regression risks and UX validation checklist

Rules:
- No generic advice.
- Avoid brand-agnostic boilerplate.
- Prioritize practical operator outcomes over visual novelty.
```
