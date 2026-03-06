# Android Parity Policy

## Purpose

This policy prevents GoatCitadel mobile from becoming a permanently lagging companion.

## Rules

1. Every new user-facing Mission Control feature added after Android work begins must create one of:
   - an Android implementation task in the same milestone, or
   - a documented desktop-only exception.
2. Desktop-only exceptions must include:
   - reason
   - expected duration
   - whether the feature is planned for later mobile parity
3. API changes that affect parity-critical features must include Android contract review.
4. Public-beta readiness should report web/mobile parity state explicitly rather than assuming it.

## Parity-critical domains

- auth and pairing
- dashboard
- chat and provider/model selection
- approvals
- tasks
- durable runs / replay
- memory lifecycle
- skills / MCP / integrations discovery and control
- settings and runtime health

## Governance

The default assumption is parity, not divergence.
