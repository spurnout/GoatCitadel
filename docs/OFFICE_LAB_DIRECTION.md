# Office Lab Direction

Last updated: 2026-03-11

This doc records the current office-direction policy for GoatCitadel. It is intentionally directional and additive. It does not replace the existing Office surface or authorize shipping a new office experiment ahead of the Wave 3–4 reliability gate.

## Current product posture

- `Office` remains the stable product surface.
- `Office Lab` is a separate Mission Control tab with its own non-3D 2D office layout.
- The current `Office Lab` implementation is pixel-inspired and deck-based rather than a second 3D camera/runtime profile.
- It still uses GoatCitadel's live agent, approval, and event feeds rather than a separate office backend.

## Citadel-first direction

The long-term office should read as GoatCitadel specifically, not as a generic cozy pixel office.

Required direction:

- named decks stay explicit and readable
- layout stays function-first
- environment language favors command-citadel structures over domestic office props
- goat identity appears through operators, subagents, insignias, heraldry, banners, crowns, horns, and key props
- avoid novelty-heavy goat clutter

Primary deck vocabulary:

- `Command Deck`
- `Build Bay`
- `Research Lab`
- `Security Watch`
- `Ops Lane`

Preferred environment language:

- spires
- relay gantries
- forge bays
- scan chambers
- shield walls

## Behavior contract

The office is a visualization and handoff surface, not a second hidden control plane.

First-pass office behavior stays function-first:

- approval handling
- session/detail handoff
- operator inspection
- visible swarm and squad state

The office should visualize surface identity rather than inventing its own orchestration model:

- `Chat` = fast single-assistant surface, no silent team growth
- `Cowork` = guided swarm with one visible lead and explicit specialist growth under caps
- `Code` = constrained specialist squad with tighter project-bound growth rules

## Clone and donor policy

GoatCitadel follows a clone-first policy when licensing is clean:

- prefer cloning or adapting permissive-code repos over reimplementing everything from scratch
- preserve upstream attribution and license notices in any vendored or adapted code
- treat donor repos as bounded references, not as product-definition substitutes

Current donor roles:

- `pixel-agents`: first temporary `Office Lab` renderer/runtime base
- `agent-office`: strongest donor for constrained self-growing team behavior and office/game structure
- `agentroom`: strongest donor for office behavior, project focus, and session adjacency
- `tenacitOS`: strongest donor for function-first Mission Control layout and modular shell structure
- `Star Office UI`: named-zone and status-mapping donor only, not a direct art base
- `JARVIS`: orchestration watchlist and operator-loop donor only

## Asset policy

See [OFFICE_ASSET_SOURCING.md](./OFFICE_ASSET_SOURCING.md) for the concrete sourcing lane. This section records the higher-level direction.

- use free assets only when needed and only when they fit the GoatCitadel citadel and sci-fi direction
- prefer citadel-compatible structural and background assets over generic cozy-office packs
- paid assets are fallback only when a concrete citadel-themed gap remains
- AI-generated pixel art is supplemental only

Allowed AI-generated uses:

- decals
- insignias
- hologram panels
- banners
- minor props

Disallowed default use:

- primary environment sets
- the foundational office art style

Every shipped asset must still be recorded with provenance and license notes in:

- [office-source-manifest.json](./office-source-manifest.json)
- the runtime asset manifest under `apps/mission-control/public/assets/office/`

## Non-goals for this phase

- shipping `Office Lab` before Wave 3–4 stability
- introducing office-specific backend APIs
- inventing a second team-growth runtime outside the existing delegation/subagent/session model
- replacing the current `Office` tab during the reliability work
- returning to a second 3D office variant for the lab tab
