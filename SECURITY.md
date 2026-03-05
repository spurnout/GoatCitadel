# Security Policy

Last updated: 2026-03-05

## Supported Versions

GoatCitadel is currently pre-1.0. Only the latest prerelease line is supported for security updates.

| Version line | Supported |
|---|---|
| `0.6.0-beta.x` | Yes |
| Earlier prerelease builds | Best effort only |

## Reporting a Vulnerability

Please report suspected vulnerabilities privately first.

Recommended report content:

- Affected component and version/commit.
- Reproduction steps.
- Impact assessment.
- Suggested mitigation (if known).

Temporary contact path (until dedicated security inbox is published):

- Open a private GitHub security advisory in the repository.

Do not publish exploit details before coordinated remediation.

## Disclosure Process

1. Acknowledge report and reproduce.
2. Classify severity and affected surfaces.
3. Patch and validate with tests.
4. Publish fix notes in `CHANGELOG.md`.
5. Credit reporter if approved.

## Severity Guidance

- Critical: auth bypass, policy bypass, remote code execution, secret exfiltration.
- High: privilege escalation, approval bypass, data corruption with broad impact.
- Medium: scoped data leak or significant availability issues.
- Low: minor information exposure or hard-to-exploit edge case.

## Security Invariants

- Deny-wins policy precedence is mandatory.
- Approval-required actions remain gated.
- Tool grants and sandbox limits are never weakened by local docs.
