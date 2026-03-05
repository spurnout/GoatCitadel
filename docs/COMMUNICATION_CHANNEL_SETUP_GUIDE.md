# Communication Channel Setup Guide (Beginner Friendly)

Last updated: 2026-03-05

This guide walks you through channel setup for GoatCitadel with the easiest path first.

## Channel Status in GoatCitadel

| Channel | Catalog ID | Status | Recommended Today |
|---|---|---|---|
| Terminal/TUI | `channel.tui` | Native | Yes (fastest local ops) |
| Webchat | `channel.webchat` | Native | Yes (browser clients) |
| Discord | `channel.discord` | Beta | Yes (best first external channel) |
| Slack | `channel.slack` | Beta | Yes |
| Telegram | `channel.telegram` | Beta/Planned integration surface | Pilot only |
| Matrix | `channel.matrix` | Beta | Pilot only |
| Signal/WhatsApp/Teams/etc. | `channel.*` | Planned | Not for first rollout |

## Before You Start

1. Use token auth for any non-loopback deployment.
2. Keep break-glass security env vars disabled.
3. Store tokens in environment variables, not in repo files.

Minimum secure baseline in `.env`:

```env
GOATCITADEL_AUTH_MODE=token
GOATCITADEL_AUTH_TOKEN=<long-random-token>
```

## Discord (Recommended First)

Official references:
- Discord getting started: https://docs.discord.com/developers/docs/getting-started
- Discord applications portal: https://discord.com/developers/applications
- Discord app installation model/scopes: https://docs.discord.com/developers/resources/application

### Step-by-step

1. Open the Discord Developer Portal and sign in.
2. Click `New Application`, give it a name, create it.
3. Go to `Bot` in the left sidebar.
4. Generate or reset the bot token.
5. Copy token to your local env as `DISCORD_BOT_TOKEN`.
6. Go to `Installation`:
   - enable `applications.commands`
   - for guild install also include `bot`
   - add minimal bot permissions (start with `Send Messages`).
7. Copy the install link and add the bot to your test server.
8. In GoatCitadel Mission Control:
   - open `Integrations`
   - add `channel.discord`
   - set `botTokenEnv=DISCORD_BOT_TOKEN`
   - set default channel ID.
9. Send a test message with `channel.send` or through your configured workflow.

### Discord troubleshooting

- Bot not responding: confirm it was added to the server and channel permissions allow posting.
- Missing message content behavior: check privileged intent requirements in Discord docs.
- 401/403 errors: token invalid or permissions/scopes too narrow.

## Slack

Official references:
- Slack app creation + OAuth: https://api.slack.com/authentication/oauth-v2
- Slack app settings + install flow examples: https://api.slack.com/tutorials/first-bolt-app

### Step-by-step

1. Open Slack API app dashboard.
2. Create app `From scratch` and select your workspace.
3. Under `OAuth & Permissions`, add bot scopes (start with `chat:write`).
4. Install/Reinstall app to workspace.
5. Copy Bot User OAuth token and store as `SLACK_BOT_TOKEN`.
6. In GoatCitadel Mission Control `Integrations`:
   - add `channel.slack`
   - set `botTokenEnv=SLACK_BOT_TOKEN`
   - set default channel (ex: `#ops`).
7. Send a test post.

## Telegram (Pilot)

Official references:
- Bot setup tutorial: https://core.telegram.org/bots/tutorial

### Step-by-step

1. In Telegram, open `@BotFather`.
2. Run `/newbot` and complete naming prompts.
3. Copy the bot token and store as `TELEGRAM_BOT_TOKEN`.
4. Add your bot to target chats/channels and grant posting rights.
5. Add channel integration in GoatCitadel using your integration profile.

Note: treat Telegram as pilot until your end-to-end workflow tests are stable.

## Matrix (Pilot)

Reference:
- Matrix client-server API: https://spec.matrix.org/latest/client-server-api/index.html

High-level steps:
1. Create Matrix user/service account on your homeserver.
2. Obtain access token using your homeserver’s supported auth flow.
3. Configure GoatCitadel channel integration with room IDs and token env ref.
4. Validate send-only path first, then command/reply workflows.

## Local Channels (Fastest + Cheapest)

### TUI (`channel.tui`)

```powershell
pnpm tui
```

Best for advanced operators who prefer keyboard-centric workflows.

### Webchat (`channel.webchat`)

Use Mission Control and web routes for local browser operations.

## Security Checklist Before Public Sharing

- [ ] `GOATCITADEL_AUTH_MODE` is `token` or `basic`.
- [ ] Strong auth token is set.
- [ ] No break-glass env var enabled.
- [ ] Channel tokens are in env vars only.
- [ ] Test channel limited to a sandbox room/channel first.
- [ ] Rotate token immediately if exposed.

## Validation Checklist Per Channel

1. Connection create succeeds.
2. Health check passes.
3. Send test message succeeds.
4. Error handling is readable (bad token, no permission, bad channel).
5. Approval/safety policy still applies to connected workflows.
