import { useEffect, useState } from "react";
import {
  clearGatewayAuthState,
  getGatewayAuthStorageMode,
  persistGatewayAuthState,
  readStoredGatewayAuthState,
  type GatewayAccessPreflightResult,
  type GatewayAuthState,
} from "../api/client";
import { StatusChip } from "./StatusChip";
import { GCSelect, GCSwitch } from "./ui";

type GatewayAccessView =
  | GatewayAccessPreflightResult
  | {
    status: "checking";
    message: string;
    healthDetail?: string;
    authMode?: GatewayAuthState["mode"];
  };

interface GatewayAccessGateProps {
  gatewayBaseUrl: string;
  access: GatewayAccessView;
  busy: boolean;
  onRetry: () => void | Promise<void>;
}

type AccessAuthMode = "token" | "basic";

function resolveStatusTone(status: GatewayAccessView["status"]): "warning" | "critical" | "muted" | "live" {
  if (status === "checking") {
    return "muted";
  }
  if (status === "ready") {
    return "live";
  }
  if (status === "needs-auth") {
    return "warning";
  }
  return "critical";
}

function resolveStatusLabel(status: GatewayAccessView["status"]): string {
  if (status === "checking") {
    return "Checking";
  }
  if (status === "needs-auth") {
    return "Access required";
  }
  if (status === "unreachable") {
    return "Gateway offline";
  }
  if (status === "misconfigured") {
    return "Gateway misconfigured";
  }
  return "Ready";
}

export function GatewayAccessGate({
  gatewayBaseUrl,
  access,
  busy,
  onRetry,
}: GatewayAccessGateProps) {
  const [authMode, setAuthMode] = useState<AccessAuthMode>("token");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredGatewayAuthState();
    setAuthMode(access.authMode === "basic" ? "basic" : stored?.mode === "basic" ? "basic" : "token");
    setToken(stored?.token ?? "");
    setUsername(stored?.username ?? "");
    setPassword(stored?.password ?? "");
    setRemember(getGatewayAuthStorageMode() === "persistent");
    setFormError(null);
  }, [access.authMode, access.status]);

  const storedAuthPresent = Boolean(readStoredGatewayAuthState());
  const needsAuth = access.status === "needs-auth";

  const handleConnect = async () => {
    setFormError(null);
    if (authMode === "token") {
      if (!token.trim()) {
        setFormError("Enter the gateway token before retrying.");
        return;
      }
      persistGatewayAuthState({
        mode: "token",
        token,
        tokenQueryParam: "access_token",
      }, remember ? "persistent" : "session");
      await onRetry();
      return;
    }

    if (!username.trim() || !password) {
      setFormError("Enter both username and password before retrying.");
      return;
    }

    persistGatewayAuthState({
      mode: "basic",
      username,
      password,
    }, remember ? "persistent" : "session");
    await onRetry();
  };

  return (
    <section className="gateway-access-shell" aria-live="polite">
      <div className="panel panel-pad-spacious panel-accent gateway-access-card">
        <div className="gateway-access-header">
          <div className="gateway-access-copy">
            <p className="shell-topbar-kicker">Remote gateway handshake</p>
            <h1 className="gateway-access-title">Mission Control access gate</h1>
            <p className="office-subtitle gateway-access-subtitle">
              Mission Control is waiting for a verified gateway session before it starts live data and control surfaces.
            </p>
          </div>
          <StatusChip tone={resolveStatusTone(access.status)}>{resolveStatusLabel(access.status)}</StatusChip>
        </div>

        <div className="gateway-access-meta">
          <div>
            <span className="sidebar-footer-label">Gateway target</span>
            <p className="gateway-access-mono">{gatewayBaseUrl}</p>
          </div>
          <div>
            <span className="sidebar-footer-label">Probe detail</span>
            <p className="gateway-access-note">{access.healthDetail ?? "Waiting for the first gateway probe."}</p>
          </div>
        </div>

        <div className="gateway-access-status">
          <p>{access.message}</p>
        </div>

        {formError ? <p className="error gateway-access-error">{formError}</p> : null}

        {needsAuth ? (
          <div className="gateway-access-form">
            <div className="controls-row gateway-access-row">
              <label htmlFor="gateway-access-mode">Credential type</label>
              <GCSelect
                id="gateway-access-mode"
                aria-label="Gateway credential type"
                value={authMode}
                onChange={(value) => setAuthMode(value as AccessAuthMode)}
                options={[
                  { value: "token", label: "Token" },
                  { value: "basic", label: "Basic" },
                ]}
              />
            </div>

            {authMode === "token" ? (
              <div className="controls-row gateway-access-row">
                <label htmlFor="gateway-access-token">Gateway token</label>
                <input
                  id="gateway-access-token"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : (
              <>
                <div className="controls-row gateway-access-row">
                  <label htmlFor="gateway-access-username">Username</label>
                  <input
                    id="gateway-access-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="controls-row gateway-access-row">
                  <label htmlFor="gateway-access-password">Password</label>
                  <input
                    id="gateway-access-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </>
            )}

            <div className="controls-row gateway-access-row">
              <GCSwitch
                id="gateway-access-remember"
                checked={remember}
                onCheckedChange={setRemember}
                label="Remember credentials on this browser"
              />
            </div>
          </div>
        ) : null}

        <div className="gateway-access-actions">
          {needsAuth ? (
            <button type="button" onClick={() => void handleConnect()} disabled={busy}>
              {busy ? "Connecting..." : "Connect to gateway"}
            </button>
          ) : (
            <button type="button" onClick={() => void onRetry()} disabled={busy}>
              {busy ? "Re-checking..." : "Retry gateway check"}
            </button>
          )}

          {storedAuthPresent ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                clearGatewayAuthState();
                setToken("");
                setUsername("");
                setPassword("");
              }}
              disabled={busy}
            >
              Clear saved credentials
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
