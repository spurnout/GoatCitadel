# Mission Control Copy Audit (85/15 Human + Goat)

## Goal
This pass rewrites Mission Control microcopy to be clear for first-time operators while preserving GoatCitadel personality.

- Human clarity target: 85%
- Goat flavor target: 15%
- Safety-critical text: 100% plain and direct

## Voice Rules
1. Use plain action-first language for controls (`Save`, `Archive`, `Restore`, `Delete Permanently`).
2. Keep goat flavor mostly in page branding/subtitles, not in safety warnings.
3. Never add jokes or metaphors in risk/approval/error copy.
4. Keep core terms stable: `Role ID`, `Session`, `Approval`, `Archive`, `Hard delete`.

## Centralized Copy System
Copy is now centralized in:

- `apps/mission-control/src/content/copy-types.ts`
- `apps/mission-control/src/content/copy.ts`

It now drives:

- Sidebar labels and section grouping
- Next-step guidance per tab
- Page titles/subtitles/guide cards
- Shared helper labels for selector modes and common actions
- Shared helper text for guided config forms and smart path inputs

## Agent Create Guardrails (Goat Crew)
Implemented to prevent accidental overwrite confusion:

1. Create mode uses a custom text input for `Role ID` (no role dropdown).
2. Live role availability status:
   - `available`
   - `taken`
   - `invalid`
3. `Create Agent` is blocked when role ID is invalid/taken/missing.
4. Submit-time recheck fetches latest agent list before create.
5. Duplicate race errors map to friendly text:
   - `That Role ID was just claimed. Pick another.`
6. Built-in safety note is always visible in create mode.
7. Built-in rows are visibly marked with a `built-in` badge.

## Per-Page Copy Migration Summary

### App Shell
- Migrated nav labels/sections/status/footer text to centralized copy.
- Migrated `Next Step` mapping to centralized copy.

### Pages
- Migrated titles/subtitles/guide blocks to centralized copy for:
  - Launch Wizard
  - Summit
  - Engine
  - Trail Files
  - Memory Pasture
  - Goat Crew
  - Herd HQ
  - Pulse
  - Bell Tower
  - Runs
  - Playbook
  - Feed Ledger
  - Forge
  - Tool Access
  - Gatehouse
  - Trailboard
  - Connections
  - Mesh
  - NPU Runtime
  - Live Feed

### Shared Components
- `PageGuideCard` now uses centralized section labels.
- `SelectOrCustom` uses centralized mode/help text.
- `CommandPalette` uses centralized placeholder copy.
- `ChangeReviewPanel` uses centralized empty-state copy.
- `ConfigFormBuilder` uses centralized helper labels.
- `SmartPathInput` uses centralized loading/edit-state copy.
- `ConfirmModal` defaults use centralized common labels.

## Before/After Examples

### Example 1: Generic -> Instructional
- Before: `Live session health, token usage, and feed-cost visibility.`
- After: `Session health, activity timeline, and spend visibility for active conversations.`

### Example 2: Technical -> Human
- Before: `No guided schema available. Use advanced JSON.`
- After: `No guided schema is available for this connection yet. Use Advanced JSON if needed.`

### Example 3: Ambiguous -> Safe
- Before: agent create role picker mixed with existing roles.
- After: dedicated Role ID input + availability check + duplicate prevention.

## Glossary
- `Artifact`: A useful output file (report, brief, note, release doc).
- `Role ID`: Stable identity key for an agent profile.
- `Session`: Routed conversation stream (channel/account/peer/thread).
- `Approval`: Human confirmation for risky operations.
- `Archive`: Soft delete; record remains recoverable.
- `Hard delete`: Permanent removal.

## Forbidden Phrasing
Avoid these in UI copy:

- Vague placeholders like `Custom value...` without context.
- Joke-heavy safety warnings.
- Internal implementation jargon in helper text (`payload`, `serialization`, `schema mismatch`).

## Calibration Notes
- Goat flavor is intentionally constrained to brand and page personality.
- Operational and safety messaging remains direct and professional.
- Copy was optimized for people new to the system while preserving expert utility.
