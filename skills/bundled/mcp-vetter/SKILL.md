---
name: mcp-vetter
description: Review a prospective MCP server for GoatCitadel adoption. Use when evaluating an MCP registry entry, GitHub repo, vendor docs page, or proposed MCP install so you can decide trust tier, auth posture, policy defaults, overlap risk, and whether the server should be adopted, quarantined, or rejected.
metadata:
  version: "0.1.0"
  tags:
    - mcp
    - trust
    - security
    - review
    - goatcitadel
  tools:
    - fs.read
    - memory.read
  keywords:
    - mcp-vetter
    - vet this mcp
    - review this mcp server
    - evaluate this mcp server
    - is this mcp safe
    - mcp trust review
    - mcp install review
---

# mcp-vetter

Use this skill to judge whether an MCP server belongs in GoatCitadel before anyone installs or enables it.

## What This Skill Does

- reviews the server against GoatCitadel trust posture
- identifies auth model, transport shape, and likely side effects
- checks overlap with existing native features, integrations, or MCP templates
- recommends trust tier and default policy
- returns a clear adoption verdict instead of vague pros/cons

## What This Skill Does Not Do

- it does not install the server
- it does not edit runtime config
- it does not weaken policy defaults
- it does not treat marketplace popularity as proof of safety

## Review Order

1. Confirm the source:
   - official vendor docs/repo
   - community repo
   - abandoned or unclear maintainer

2. Classify the transport:
   - stdio
   - HTTP / streamable HTTP
   - SSE

3. Classify auth:
   - none
   - token
   - OAuth2
   - host-specific / unclear

4. Classify blast radius:
   - read-only docs or search
   - repo / file mutation
   - billing / customer data
   - browser automation
   - infrastructure / production control

5. Check for overlap:
   - does GoatCitadel already have a native feature for this?
   - does an existing MCP template already cover this?
   - would this duplicate a current skill or tool path?

## Default Heuristics

- official, read-only docs MCP:
  - likely `trusted`
  - `redactionMode = basic`
  - first-use approval optional

- repo, billing, browser, or customer-data MCP:
  - default `restricted`
  - `redactionMode = strict` for sensitive data
  - `requireFirstToolApproval = true`

- unclear maintainer, weak docs, or dangerous tool mix:
  - `quarantined` or reject

- if GoatCitadel already has a native path, prefer the native path unless the MCP server adds clear net-new value

## Output Contract

Return these sections:

### Verdict
- `adopt`
- `conditional`
- `quarantine`
- `reject`

### Why
- 2-5 concrete reasons tied to source, auth, tool surface, and overlap

### Recommended GoatCitadel Settings
- trust tier
- auth type
- redaction mode
- first-use approval
- allow/block pattern ideas if obvious

### Operator Notes
- what needs manual review
- what would make the server safer
- whether a native integration is better

## GoatCitadel References

When relevant, align with:

- `docs/MCP_SKILLS_CURATION.md`
- `docs/SKILL_IMPORT_AND_TRUST_POLICY.md`

## Good Triggers

- "vet this mcp"
- "review this mcp server"
- "is this mcp safe"
- "should we add this mcp"
- "evaluate this mcp server for GoatCitadel"
