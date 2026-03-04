# Secure Android Companion App Blueprint for GoatCitadel Mission Control

## Executive summary and final recommendation

A secure Android companion app for remote operations and observability of an agent control plane has two “hard truths” that should drive design choices:

First, **Android will not reliably allow a always-on background network connection** unless you run a foreground service with an ongoing notification and accept modern restrictions, power policies, and OEM variability. The platform’s background execution limits and Doze/App Standby behavior are explicitly designed to defer background CPU/network activity. citeturn0search0turn0search12turn4search3

Second, **most control-plane actions cannot be end-to-end encrypted from the server** if the server must interpret, authorize, and execute them. You *can* still do “E2EE-oriented” design by (a) making **transport confidentiality non-negotiable** (TLS everywhere), (b) adding **message-level integrity** (request signing + replay protection), and (c) encrypting **select payload fields/data blobs** that the server does not need to read (e.g., secret parameters forwarded to agents). citeturn0search3turn7view0

### Final recommendation

**Build Android-first in native Kotlin + Jetpack Compose**, and treat cross-platform UI as a future option rather than a foundation. Compose is a first-party “native UI toolkit” and gives you the cleanest access to Android’s platform security primitives and lifecycle controls. citeturn4search6turn4search18

For security architecture:

- Use **token-based auth** as your default (as you prefer), but harden it with **short-lived access tokens + rotating refresh tokens**, plus optional **proof-of-possession** (DPoP-like) or HTTP message signatures to reduce bearer-token replay risk. citeturn3search0turn3search1turn0search3  
- Recommend Tailnet/Tailscale as the “best path” (private addressing + WireGuard encryption + granular access controls), but keep **LAN direct** and **public endpoint** viable via strongly hardened TLS + pinning/TOFU options. citeturn1search3turn1search23turn2search0  
- Keep real-time updates primarily as **SSE with resume** (Last-Event-ID), and design around mobile realities: when backgrounded, rely on **push-to-wake** (minimal content) or user-driven refresh, not a permanent stream. citeturn9search2turn9search13turn0search12turn8search9  
- Implement **request signing + nonce/timestamp** for mutating operations (especially “critical” actions), plus server-side replay caches and tamper-evident audit chaining. citeturn0search3turn0search35turn8search3

Where I’m explicitly uncertain (and will flag when relevant): precise “SSE vs WebSocket battery” claims are hard to support with universal, authoritative measurements because results vary by radio conditions, OEM background policies, and whether you can keep sockets alive at all under Doze. The safer guidance is to **assume background streaming is unreliable** regardless of protocol and architect accordingly. citeturn0search12turn0search0turn4search3

## Architecture options and decision

### What matters most for *this* app

Your app is a “remote ops + observability” control surface. Security and reliability hinge less on UI polish and more on:

- Correct use of Android lifecycle and background constraints (WorkManager/foreground services). citeturn2search19turn4search15turn0search0  
- High-assurance key storage and signing operations (Android Keystore / StrongBox where available). citeturn7view0  
- Precise, testable network behavior (TLS config, pinning/TOFU, retries, backoff, SSE resumption). citeturn1search2turn1search1turn9search2turn9search0  
- Long-term maintainability for a security-sensitive codebase (dependency hygiene and minimizing “glue layers”).

### Side-by-side comparison table

| Dimension | Native Kotlin + Jetpack Compose | Flutter | React Native |
|---|---|---|---|
| Security posture (platform leverage) | Best access to platform security, lifecycle, and network controls with minimal abstraction. Compose is native UI toolkit. citeturn4search6turn4search18 | Strong framework, but you’ll rely on plugins for security-sensitive primitives; release builds compile to machine code. citeturn4search0turn4search4 | Security is achievable, but you inherit JS/runtime + native boundary complexity; official docs emphasize security is a set of options/choices. citeturn4search5turn5search0 |
| Background networking reliability | Most controllable: WorkManager + foreground services + fine-grained Android APIs. citeturn2search19turn4search15turn4search3 | Ultimately the same Android OS constraints; background behavior depends on plugin quality and platform channels. (Inference based on Android constraints.) citeturn0search0turn0search12 | Same OS constraints; additional moving parts (JS engine/interfacing). New Architecture removes async bridge via JSI. citeturn5search0turn4search9 |
| Crypto & key storage quality | Direct Keystore/StrongBox usage; strongest options for non-exportable keys and user-auth-bound operations. citeturn7view0 | Secure storage typically via plugins; common plugin uses encrypted shared preferences with Tink on Android. citeturn5search1turn11search4 | Secure storage via native keystore/keychain libraries (e.g., react-native-keychain). citeturn5search2turn5search9 |
| Performance | Excellent; lowest overhead for networking + cryptography; predictable profiling. | Very good; compiled to native machine code in release; rendering via Flutter engine. citeturn4search0turn4search4 | Good, but depends on JS runtime; Hermes is default and aims to improve startup/memory. citeturn4search9 |
| Maintainability for Android-only scope | Best: fewer layers, fewer cross-platform abstractions, easier security reviews. | Good if you expect iOS later; otherwise you pay a “platform bridge” tax. (Inference.) | Similar: great if you need shared code across platforms; otherwise extra complexity. (Inference.) |
| Long-term risk | Lowest: aligns with Android platform direction and constraints; fewer third-party security-critical plugins. citeturn4search18turn0search29 | Moderate: framework + plugin ecosystem risk; still strong backing and docs. citeturn4search0turn4search32 | Moderate: wider JS supply chain; architecture churn historically, though New Architecture is now the direction. citeturn5search0turn4search5 |

### Decision

Choose **Native Kotlin + Jetpack Compose** for the first production-grade Android companion app.

**Do this, not that**

- Do: Keep security-sensitive code (token storage, signing, TLS policy) in pure Android/Kotlin modules with strict review. citeturn7view0turn0search29  
- Not that: Put crypto and authentication flows behind a cross-platform plugin layer as your *first* implementation (harder to audit and debug; higher dependency risk). (Inference informed by complexity tradeoffs.)

## Transport and connectivity models

You want multiple connectivity/auth paths. The secure approach is to support them all, but **make the “unsafe defaults” hard to stumble into**.

### LAN direct

**Secure connection model**

- Default to HTTPS with TLS (even on LAN). If you allow HTTP on LAN, you will eventually regret it on coffee-shop Wi‑Fi, shared VLANs, or compromised routers. citeturn1search6turn10search3  
- For self-hosted LAN servers that use self-signed certs, implement **TOFU**:
  - First connection: show the server certificate public-key fingerprint to the user (and optionally also show it in the web UI) and require explicit trust.
  - Persist the fingerprint per server profile and enforce it thereafter (“SSH known_hosts, but for your control plane”).  
- Optionally support **custom trust anchors** (Android Network Security Config) for users who prefer installing a private CA. citeturn1search2  

**Threat tradeoffs**

- Primary risk: on-path attacker on local network attempts MitM to steal tokens or inject commands. TLS + (TOFU or pinned/anchored trust) mitigates. citeturn1search2turn1search24  
- Residual risk: rooted device or local malware can bypass pinning logic; treat pinning as defense-in-depth, not magic. citeturn1search24  

### Tailnet / Tailscale

**Secure connection model**

- Treat tailnet mode as the *recommended path*: private addressability + encrypted tunnel via WireGuard + “deny by default” policy with fine-grained access control rules (“grants”/ACLs). citeturn1search3turn1search19turn1search23turn2search20  
- Still require app-layer auth: tailnet should reduce exposure, not replace your auth model.

**Threat tradeoffs**

- Major benefit: reduces “public internet attack surface” dramatically (no open ports to the world) and makes discovery simpler. citeturn2search0turn1search23  
- Relays (DERP/peer relays) are used when direct connection isn’t possible; Tailscale describes DERP as encrypted and with no visibility into payload data, but it’s still an additional dependency and a metadata surface (timing/traffic patterns). citeturn2search1turn2search9  

### Reverse proxy / public endpoint

**Secure connection model**

- Use a reverse proxy (deployment-flexible) with:
  - Modern TLS (ACME-managed certificates where possible)
  - Rate limiting at the edge
  - Strict request size limits
  - IP allowlists optional (for users who can)  
- Keep your Fastify app behind it, and still enforce token + signature checks.

**Threat tradeoffs**

- Internet exposure increases brute force, credential stuffing, token replay attempts, and DoS risk. You must treat this as a hostile environment and implement controls consistent with common API risk guidance. citeturn10search1turn10search9  

### Optional relay architecture

If you want a “works everywhere even behind strict NAT without tailnet” option, you can build a relay, but be very deliberate:

- **Minimal relay**: a dumb pipe that never sees secrets (end-to-end encrypted payloads, signed envelopes).  
- **Brokered ops**: relay also handles auth/routing—more convenient, but it becomes a security-critical service.

A useful reference point is that tailnet relays exist specifically for NAT traversal fallback (DERP/peer relays). citeturn2search1turn2search5

**Practical recommendation**: For a self-hosted audience, prioritize (1) LAN direct, (2) tailnet, (3) reverse proxy. Add a custom relay only if you have a clear “must work behind CGNAT without third-party VPN” requirement.

## Authentication and session security

### Token-based auth best practices for mobile

At minimum, your token mode should evolve from “static bearer token” to “scoped, time-bound sessions”:

- **Access tokens**: short-lived (minutes to an hour), scoped (read vs approve vs execute).  
- **Refresh tokens**: longer-lived, stored securely, rotated on use, revocable.  
- **Device binding** (strongly recommended): add proof-of-possession so a stolen token is less useful.

This aligns with mainstream OAuth security guidance from the standards community (even if you don’t implement full OAuth/OIDC initially). citeturn3search0turn0search2

If you do implement OAuth/OIDC later, follow the native app best current practice: use external user agents (browser/custom tabs), not embedded webviews. citeturn0search2turn3search7

### Optional OIDC and device-flow alternatives

You can support a “simple token” UX today while leaving the door open:

- **Device Authorization Grant** is explicitly designed for devices with limited input and allows pairing without typing passwords into a mobile app UI. Even if phones *can* do browser flows, device flow can be an excellent “pair this companion app to an existing logged-in web UI” experience. citeturn3search2  
- If you choose OAuth/OIDC on Android, **AppAuth** is widely used and explicitly follows RFC 8252 guidance. citeturn3search7turn0search2  

### Token rotation, expiry, revocation, refresh

**Implementation-ready guidance**

- Rotate refresh tokens on each use and invalidate the previous token (“one-time refresh token” pattern). This reduces replay value if a refresh token leaks. (Common best practice; consistent with security BCP themes.) citeturn3search0turn3search1  
- Maintain a server-side revocation list keyed by refresh token family / device ID / session ID.
- Use “last used” timestamps and require periodic re-auth for high-risk operations.

### DPoP-style sender constraining (recommended)

Bearer tokens are convenient but replayable. DPoP is a standardized method to “sender-constrain” tokens at the application layer. citeturn3search1

You do not need to fully implement OAuth to steal the *idea* safely:

- Generate a per-server device key pair in Android Keystore (non-exportable if possible). citeturn7view0  
- At login/pairing, register the device public key with the server and bind session tokens to its fingerprint.
- For each request, send a DPoP-like proof (signed JWT or HTTP message signature) containing method, URL, iat, nonce, and token hash.
- Server rejects mismatched proofs (token stolen but key not present) and repeated nonces.

### Certificate pinning and trust-on-first-use

Android supports certificate pinning and custom trust anchors via Network Security Config. citeturn1search2  
OkHttp supports certificate pinning but explicitly warns that pinning increases operational complexity and can break certificate rotation if done carelessly. citeturn1search1  
OWASP’s mobile testing guidance also documents multiple ways attackers can bypass pinning on compromised devices (e.g., instrumentation/hooking). citeturn1search24

**Practical approach for self-hosted servers**

- **Public endpoint**: pin to SPKI (public key) of an intermediate or a stable key, and implement a “pin set” (current + next) to allow rotation.  
- **LAN self-signed**: TOFU is often the least painful and most user-respectful pattern:
  - Pairing screen shows fingerprint and requires a manual confirm.
  - Store per-server fingerprint in secure storage.
  - Provide “Reset trust” button requiring strong local auth.

### Safe handling for multi-server profiles

Treat every server profile as a separate trust domain:

- Separate: base URL, tailnet IP/DNS, TLS trust (pins/TOFU), tokens, device key pair, and local cache namespace.
- Never reuse refresh tokens across profiles.
- UI must always show “which server am I on?” and “am I about to execute on prod vs lab?”

**Do this, not that**

- Do: “Pairing tokens” that are short-lived, single-use, scope-limited, and bound to a server fingerprint.  
- Not that: long-lived static API tokens that grant full control forever.

## E2EE-oriented security model and Android local security

### What can realistically be end-to-end encrypted

If your Node/Fastify control plane is the component that authorizes and dispatches actions, it generally must see:

- The command type
- The target resource (agent/session/task)
- The authorization context
- Often the parameters (unless you redesign routing)

So classic “server can’t read anything” E2EE is not achievable for most *command execution* without moving trust/authorization down to agents.

**What *is* realistic: selective E2EE**

- **E2EE fields**: encrypt only payload parts the server does not need, such as “secret parameters” forwarded to an agent, or file blobs stored for later retrieval.  
- **E2EE observability artifacts**: optionally encrypt logs or memory snippets at rest so the server stores ciphertext and clients/agents decrypt.  
- This is “E2EE-oriented” while keeping the control plane functional. (Design inference grounded in server execution requirements.)

### Command integrity, replay protection, and request signing

Even with TLS, message-level signing provides strong benefits for a control plane:

- Protects against certain proxy bugs/misconfigurations and some classes of server-side confusion.
- Makes command tampering detectable even if something terminates and re-originates TLS.
- Allows “non-repudiation-ish” audit evidence when combined with key management.

**Use HTTP Message Signatures (RFC 9421)** as your signing envelope standard. citeturn0search3  
Its parameter registry includes common replay defenses like `created`, `expires`, and `nonce`. citeturn0search35  

**Signing profile recommendation (implementation-grade)**

For every mutating request:

- Canonical components to sign:
  - `@method`, `@target-uri` (or `:path`), `content-digest` (hash of body), `idempotency-key`, `x-gcmc-timestamp` (server-adjusted), `x-gcmc-nonce`, `authorization` (or token hash), and optionally `x-gcmc-risk-tier`.
- Nonce strategy:
  - Client generates 96–128 bits random nonce per request.
  - Server stores `(deviceKeyId, nonce)` for a bounded window (e.g., 10 minutes) to reject replays.
- Timestamp strategy:
  - Client includes `created` and optional `expires` (short, e.g., 60–120 seconds).
  - Server validates within skew window and uses a server-provided “time offset” for clients.  
- Idempotency:
  - Reuse the same idempotency key across retries of the same operation.
  - Server returns the same result for duplicate keys (you already have this model—expand it to mobile offline). (Best practice for safe retries.) citeturn9search15  

### Audit integrity ideas

You already have audit trails; harden them with tamper evidence:

- Hash-chain audit records: each entry includes a hash of the previous entry (per stream: per server, per agent, or per session).  
- Periodic server signing: server signs checkpoints (e.g., every N events) with a long-term signing key.
- Optional “client co-signing” for approvals: the approving device signs the approval action; logs store signature + device public key ID.

This aligns with established log management guidance emphasizing integrity and reliable practices over time. citeturn8search3  
(Where you want deeper cryptographic designs, “secure logging” patterns like signed chains are widely used; the exact construction is an engineering choice.) citeturn8search10

### Local secure storage strategy on Android

**Keys**

Use the Android Keystore system for non-exportable private keys and to bind key use to user authentication when appropriate. The Keystore is designed to keep key material out of the app process and can bind keys to secure hardware (TEE/StrongBox). citeturn7view0  

**StrongBox preference (optional)**

If available, StrongBox can provide stronger physical isolation, but it has performance tradeoffs and limited supported algorithms; Android explicitly warns it’s not necessary for most apps. citeturn7view0  

**Encrypted storage APIs**

Important 2026 nuance: Jetpack Security Crypto’s release notes indicate **its APIs were deprecated in favor of platform APIs and direct use of Android Keystore** (even though the artifact is still shipped). citeturn12view0  
That means your “future-proof” plan should not depend on EncryptedSharedPreferences/EncryptedFile as the long-term centerpiece.

**Practical, durable pattern (recommended)**

- Store *keys* in Keystore. citeturn7view0  
- Store *data* (tokens, profile metadata, queued ops) in:
  - DataStore or Room, but encrypt sensitive fields yourself using a well-reviewed crypto library.
- Use entity["company","Google","tech company"] **Tink** for misuse-resistant encryption primitives and envelope patterns. Tink explicitly aims to be harder to misuse and provides high-level primitives. citeturn11search4turn11search12  
- Follow entity["organization","OWASP","appsec nonprofit"] mobile storage guidance: do not treat basic preferences as secure key storage, especially on compromised devices. citeturn0search25turn1search0

### Secure push notifications without leaking sensitive content

Push is valuable as a “wake + hint” channel, not a data channel.

- entity["company","Google","tech company"] Firebase Cloud Messaging explicitly states: the connection is encrypted, but it is **not end-to-end encrypted**, and you should implement E2EE yourself for sensitive data. citeturn8search9turn8search2  
- Best practice: send “approval needed” with *no details*, then fetch details from your server after the app wakes and authenticates.
- On-device display hardening:
  - Set lock screen visibility appropriately (Android supports `VISIBILITY_SECRET` to hide content on lock screen). citeturn8search1  
  - Follow OWASP mobile best practice guidance for avoiding sensitive data exposure in notifications. citeturn8search4

**Do this, not that**

- Do: Notification payload = `{type: "approval_waiting", serverProfileId, count}`  
- Not that: notification payload containing agent names, task contents, file paths, tokens, or error traces.

## API protocol hardening and mobile UX security patterns

### SSE vs WebSocket for mobile reliability and battery

**SSE strengths**

- SSE reconnection and resumption are built into the model via event IDs and the `Last-Event-ID` mechanism. citeturn9search2turn9search13  
- SSE is one-way, which matches your “observability stream” shape well.

**SSE weaknesses on Android**

- When the device enters Doze/App Standby, background network activity is deferred; a long-lived connection can stall or drop. citeturn0search12turn0search0  

**WebSocket strengths/weaknesses**

- WebSockets are great for truly interactive, low-latency bidirectional control, but they don’t magically override Android background limits. (The limiting factor is OS power/network policy, not protocol.) citeturn0search12turn4search3  
- If you need bidirectional low-latency *while the app is foregrounded*, WebSocket can be excellent. If you need it *while backgrounded*, you will likely need a foreground service (with all the constraints that implies). citeturn4search15turn2search6  

**Practical recommendation**

- Keep **SSE as the default** real-time channel for foreground usage. Implement:
  - event IDs
  - resume/replay window server-side
  - coherent “stream cursor” semantics  
  citeturn9search2turn9search3  
- Offer **WebSocket as an optional “interactive session mode”** (e.g., live terminal/streaming logs) only while foregrounded, with explicit UI indication that it won’t stay alive in background. (Battery/reliability tradeoff acknowledgment.) citeturn0search12turn4search3  

### Offline queuing with idempotency keys

You already have idempotency keys; mobile should lean on them heavily.

**Client strategy**

- Every mutating request includes:
  - `Idempotency-Key: uuid`
  - A request signature (see earlier)
  - A “client operation id” and optional “expiresAt”  
- Store a local “outbox” of pending ops and their final server result (once known).

**Execution strategy**

- Use WorkManager for deferred, guaranteed background execution (with constraints and exponential backoff support). citeturn2search19turn2search3turn2search31  
- Only auto-send “safe tier” operations from the outbox. For “critical tier,” require the user to re-confirm when back online.

### Retry/backoff, circuit breakers, and cascading failure safety

Use exponential backoff with jitter for retrying safe requests (reads, idempotent writes, or writes protected by idempotency keys). citeturn9search0turn9search4  
Large-scale systems guidance (e.g., entity["company","Amazon Web Services","cloud provider"]) also emphasizes designing retries to be safe via idempotency. citeturn9search15  

**Concrete defaults**

- Reads: retry with truncated exponential backoff + jitter; cap total time (e.g., 30–60 seconds). citeturn9search4  
- Mutations: retry only if:
  - request is idempotent by verb/resource ID, or
  - you have an idempotency key and the server stores/replays results  
  citeturn9search15  
- SSE reconnect: respect server-provided `retry:` guidance and resume via `Last-Event-ID`. citeturn9search3turn9search2  

### Clock skew handling

If you enforce timestamp windows for signatures:

- Server should publish a time reference:
  - include `Date` and/or a dedicated `X-Server-Time` header
  - expose a `/time` endpoint for calibration  
- Client tracks `delta = serverTime - deviceTime` and uses adjusted timestamps for request signing.
- Server accepts a modest clock skew window to reduce false rejects.

(This is standard distributed-systems practice; the signing RFC supports created/expires semantics.) citeturn0search3turn0search35  

### Safe defaults for destructive actions

You already have approval gates; mobile UX should make those gates frictionless but unskippable.

**Risk-tier UI pattern**

- Safe: read-only, filters, refresh, view logs.
- Warning: pause/resume agent, cancel task, restart stream.
- Critical: delete files, wipe memory, kill sessions, rotate keys, “stop all agents”.

For critical actions:

- Require explicit typed confirmation or biometric confirmation.
- Display “scope” (what exactly will happen) and “blast radius” (how many agents/sessions).  
- Make the “approval gate” state visible and require a second step on the approvals tab.

Android allows system biometric prompts via Biometric library (consistent UI). citeturn11search3

## Threat model, privacy posture, and decision-complete implementation blueprint

### STRIDE-style threat model and top attack paths

entity["organization","Microsoft","software company"]’s threat modeling tool documentation describes STRIDE-based threat generation as a core practice, and OWASP also recommends STRIDE as a useful mnemonic in threat modeling. citeturn10search0turn10search24  

Below are the primary threats for a mobile ops control plane, prioritized by “real-world pain” and likelihood:

**Spoofing (impersonation)**  
Top attack paths: stolen tokens; MitM on LAN; compromised device; phishing pairing codes.  
Mitigations (high impact → medium effort):
- Short-lived access tokens + rotating refresh tokens + revocation. citeturn3search0  
- Proof-of-possession (DPoP-like) to reduce replay of stolen tokens. citeturn3search1  
- TLS hardening with Network Security Config (no cleartext, optional pinning/TOFU). citeturn1search2turn1search1  

**Tampering (command/event modification)**  
Top attack paths: reverse proxy misconfig; malicious Wi‑Fi; compromised local network; server-side bug allowing parameter mutation.  
Mitigations:
- Request signing (RFC 9421) for mutating calls + nonce/timestamp replay protection. citeturn0search3turn0search35  
- Strict schema validation on server (Fastify’s JSON schema strengths), plus allowlist-based command parameters (design choice).  
- Idempotency keys + stored results to avoid duplicate side effects. citeturn9search15  

**Repudiation (denying actions)**  
Top attack paths: shared tokens; lack of per-device identity; weak audit trails.  
Mitigations:
- Per-device keys; sign approvals; store device identity in audit trails.
- Tamper-evident log chains + periodic server signing. citeturn8search10turn8search3  

**Information disclosure**  
Top attack paths: notifications leaking secrets; logs/telemetry capturing tokens; screenshots/recents thumbnails; debug builds.  
Mitigations:
- No sensitive content in push; fetch after auth; FCM not E2EE. citeturn8search9turn8search2  
- Lock screen visibility controls for notifications. citeturn8search1  
- Follow OWASP mobile guidance for preventing data exposure (notifications, screenshots, storage). citeturn8search4turn8search25turn0search25  

**Denial of service**  
Top attack paths: public endpoint brute force; SSE connection floods; expensive “costs/tasks” queries; event replay abuse.  
Mitigations:
- Rate limiting, request size caps, connection limits (especially for public endpoints). citeturn10search2turn10search9  
- Backpressure and bounded replay window for SSE (store only last N minutes/IDs). citeturn9search34turn9search2  

**Elevation of privilege**  
Top attack paths: missing object-level authorization checks (“act on another agent/session”); insecure admin endpoints.  
Mitigations:
- Apply OWASP API top risks guidance: enforce object-level authorization and robust auth. citeturn10search1turn10search9  
- Scope tokens by role + server profile.

### Privacy and compliance posture for self-hosted users

A self-hosted audience typically wants “privacy by default”:

- Data minimization: store only what the phone must display; make “local caches” user-configurable with short retention.
- No surprise telemetry: opt-in diagnostics; redact secrets; avoid collecting full request/response bodies.
- Logging discipline aligns with broader log management guidance focused on purpose, retention, protection, and disposal. citeturn8search3turn8search24

### Decision-complete implementation blueprint

#### Recommended architecture choice

**Native Kotlin + Jetpack Compose** with a modular “security-first” layout:

- **Core principle**: the “security kernel” (crypto, tokens, trust store, request signing, network policy) lives in small, testable, dependency-minimized modules.

#### Module structure

A concrete module map (Gradle modules):

- `:app` — Compose UI, navigation host, dependency injection wiring
- `:core:models` — immutable DTOs, domain models, risk tiers
- `:core:network`
  - OkHttp client config
  - TLS policy layer (public CA vs TOFU vs pinned)
  - SSE client + resumption
- `:core:auth`
  - token store interface
  - refresh/rotation logic
  - DPoP-like proof builder (optional)
- `:core:crypto`
  - Android Keystore key management (per-server/device keys)
  - RFC 9421 request signing implementation
  - nonce generation + secure random
- `:core:storage`
  - encrypted datastore/room wrappers
  - outbox queue storage
- `:core:background`
  - WorkManager jobs (sync, outbox drain, notification fetch)
  - foreground “Live Mode” service (optional, explicit user action) citeturn4search15turn2search19
- Feature modules mirroring your web tabs:
  - `:feature:approvals`, `:feature:sessions`, `:feature:costs`, `:feature:tasks`, `:feature:files`, `:feature:agents`, `:feature:memory`, `:feature:mesh`, `:feature:npu`, `:feature:settings`

#### API contract additions needed

To support secure mobile patterns cleanly, add these server endpoints/behaviors:

**Pairing and device identity**

- `POST /v1/pairing/start` (web UI triggers; returns short code + fingerprint display)
- `POST /v1/pairing/complete` (mobile submits code + device public key; server returns refresh/access tokens bound to device key)  
- `GET /v1/server-info` returns:
  - server instance ID
  - TLS public key fingerprint (if self-signed)
  - capabilities flags (supports signing, supports DPoP-like, supports Tailnet hints)
  - server time

**Token lifecycle**

- `POST /v1/auth/refresh` rotates refresh tokens, returns new pair
- `POST /v1/auth/revoke` revoke by session/device
- Token introspection optional: `POST /v1/auth/introspect` (mostly for debugging)

**Replay + signature support**

- Require headers for signed mutating routes:
  - `Signature-Input`, `Signature` (RFC 9421)
  - `Idempotency-Key`
  - `X-Client-Nonce`, `X-Client-Time` (or use signature params `nonce/created/expires`) citeturn0search3turn0search35  
- Server maintains replay cache keyed by `(deviceKeyId, nonce)`.

**SSE hardening**

- `GET /v1/events` supports:
  - `id:` fields on all events
  - bounded replay based on `Last-Event-ID`
  - per-profile authorization  
  citeturn9search2turn9search13  

#### Security middleware requirements for Node.js + Fastify

Server-side controls should align with common API risks and Node security guidance:

- Rate limiting (`@fastify/rate-limit`) for auth endpoints and public-facing routes. citeturn10search2  
- Security headers via `@fastify/helmet` (where applicable; even if mobile client doesn’t “need” them, reverse proxies and future web surfaces benefit). citeturn10search34  
- Strict input validation and schema enforcement (Fastify’s strength; also aligns with OWASP API risks around broken authorization and auth flaws). citeturn10search9turn10search1  
- Node security best practices: keep dependencies updated, handle TLS correctly, restrict dangerous defaults. citeturn10search7turn10search15  

#### Phased rollout plan

**MVP**

- Read-only dashboards (agents, sessions, tasks, costs, approvals list)
- Manual server profile entry + basic HTTPS requirement
- Token auth (static or long-lived) *but* stored securely (Keystore-backed encryption)
- SSE in foreground only, with manual refresh
- No push, or push only as “wake with no details”

**Hardened beta**

- Pairing flow with short-lived pairing codes + per-device keys
- Access/refresh token split + rotation + revocation
- Signed mutating requests (RFC 9421 profile) + replay cache
- Outbox + WorkManager drain for safe operations
- Risk-tier UI + enforced confirmation gates

**Production**

- Optional DPoP-like sender-constrained tokens
- Optional TOFU/pinning UX for LAN/self-signed deployments (with recovery UX)
- Tamper-evident audit chaining + export/download in-app
- Push notifications: minimal + lock-screen-safe; fetch-after-auth citeturn8search9turn8search1  
- Optional device integrity signals (Play Integrity) for abuse resistance (only if audience accepts Google-dependency tradeoffs). citeturn11search6turn11search10

#### Test plan and pen-test checklist

Use entity["organization","OWASP","appsec nonprofit"] MASVS/MASTG as your baseline for mobile security coverage and test completeness. citeturn1search0turn1search4  

A practical checklist (implementation-ready):

- Storage:
  - Verify tokens and server trust material are not present in plaintext storage.
  - Confirm keys are in Android Keystore and non-exportable where possible. citeturn7view0turn0search25  
- Network:
  - Confirm cleartext traffic disabled; test MitM with user-installed CA and ensure behavior matches your chosen policy. citeturn1search2turn1search24  
  - Validate replay protection: resend captured signed request → server rejects.
- Auth/session:
  - Refresh token rotation: reuse old refresh token → server rejects.
  - Token theft attempt: use token without proof/signature → rejected in hardened modes. citeturn3search1turn0search3  
- SSE/event stream:
  - Drop connection, reconnect with `Last-Event-ID`, confirm no gaps or duplicates beyond your bounded replay window. citeturn9search2turn9search3  
- UX/abuse cases:
  - Confirm critical actions require re-auth/confirm even if queued offline.
  - Confirm UI always shows selected server profile and environment.
- Notifications/screen privacy:
  - Ensure notifications contain no sensitive data; lock screen visibility correct. citeturn8search1turn8search4  
  - Validate recents thumbnails/screenshots don’t leak sensitive screens per OWASP mobile best practices. citeturn8search25turn8search14  

Finally, because Android background behavior varies, include “OEM reality” tests: stream + outbox draining on at least one Pixel reference device and two “aggressive battery optimization” OEM devices, validating WorkManager and foreground-service behavior under Doze/App Standby constraints. citeturn0search12turn0search0turn4search3