# Mobile Companion Deep Research Prompt

Use this exact prompt in ChatGPT:

```text
You are a principal mobile security architect and distributed systems engineer.

I need deep research and a decision-complete implementation blueprint for a secure Android companion app for my local-first AI control plane (“GoatCitadel Mission Control”). The app is for remote operations and observability of my agent system.

Context you must assume:
- Backend stack: Node.js + Fastify + TypeScript.
- Control plane is API-first with REST + SSE event stream.
- Existing auth modes: none, token, basic. I prefer token.
- Existing safety model: idempotency keys for mutating APIs, approval gates for risky actions, audit trails.
- Existing networking options: LAN, WAN-ready, tailnet mode supported.
- Existing UI/web app already has tabs for approvals, sessions, costs, tasks, files, agents, memory, mesh, NPU, settings.
- I do NOT want to force one connectivity/auth path. Tailnet should be recommended option, not mandatory.
- I want strong security and E2EE-oriented design where practical.
- Android-first mobile companion app scope.

Your task:
Produce a deeply researched report with concrete recommendations and tradeoff analysis for building this Android app securely.

Research requirements:
1) Architecture options:
- Native Kotlin + Jetpack Compose
- Flutter
- React Native
Compare security posture, background networking reliability, crypto/key storage quality, performance, maintainability, and long-term risk.

2) Transport and connectivity:
- LAN direct
- Tailnet/Tailscale
- Reverse proxy / public endpoint
- Optional relay architecture
Provide secure connection models and threat tradeoffs for each.

3) Authentication and session security:
- Token-based auth best practices for mobile
- Optional OIDC/device-flow alternatives
- Token rotation, expiry, revocation, refresh
- Certificate pinning and trust-on-first-use options
- Safe handling for multi-server profiles

4) E2EE/security model:
- What can realistically be end-to-end encrypted in a control app where server still executes commands?
- Design for command integrity, replay protection, nonce/timestamp strategy, request signing
- Audit integrity ideas (tamper-evident event chains / signed logs)
- Local secure storage strategy on Android (Keystore, encrypted prefs/db)
- Secure push notification patterns without leaking sensitive content

5) API protocol hardening recommendations:
- SSE vs WebSocket for mobile reliability and battery
- Offline queueing with idempotency keys
- Retry/backoff strategy
- Clock skew handling
- Safe defaults for destructive actions (confirm gates, multi-step approval)

6) Mobile UX security patterns:
- Risk-tiered action UI (safe/warning/critical)
- Explicit confirmation for high-risk operations
- Session ownership visibility
- Human-in-the-loop approval ergonomics on small screens

7) Threat model:
- STRIDE-style model for this app and backend
- Top attack paths
- Mitigations prioritized by impact and implementation effort

8) Compliance/privacy posture:
- Data minimization
- Key/secret handling
- Logging/telemetry guidance for private/self-hosted users

9) Implementation blueprint:
- Recommended architecture choice with rationale
- Decision-complete app module structure
- API contract additions needed
- Security middleware requirements
- Phased rollout plan (MVP -> hardened beta -> production)
- Test plan including pen-test checklist and abuse cases

10) Output format requirements:
- Start with an executive summary and final recommendation.
- Include a side-by-side comparison table.
- Include concrete “do this, not that” guidance.
- Include implementation-ready checklists.
- Include citations/links for important claims and standards.
- Use current best practices as of 2026 and call out any uncertainty.

Constraints:
- Do not require Tailnet as mandatory.
- Default recommendation can favor token auth + optional Tailnet hardening.
- Keep backend provider-agnostic and deployment-flexible.
- Prioritize practical security for self-hosted users, not enterprise-only assumptions.
```
