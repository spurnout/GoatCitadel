import { useCallback, useEffect, useMemo, useState } from "react";
import type { AddonCatalogEntry, AddonInstalledRecord, AddonStatusRecord } from "@goatcitadel/contracts";
import {
  fetchAddonStatus,
  fetchAddonsCatalog,
  fetchInstalledAddons,
  installAddon,
  launchAddon,
  stopAddon,
  uninstallAddon,
  updateAddon,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

export function AddonsPage() {
  const [catalog, setCatalog] = useState<AddonCatalogEntry[]>([]);
  const [installed, setInstalled] = useState<Record<string, AddonInstalledRecord>>({});
  const [statusByAddonId, setStatusByAddonId] = useState<Record<string, AddonStatusRecord>>({});
  const [busyAddonId, setBusyAddonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmInstallAddon, setConfirmInstallAddon] = useState<AddonCatalogEntry | null>(null);
  const [confirmUninstallAddon, setConfirmUninstallAddon] = useState<AddonCatalogEntry | null>(null);

  const load = useCallback(async () => {
    const [catalogResponse, installedResponse] = await Promise.all([
      fetchAddonsCatalog(),
      fetchInstalledAddons(),
    ]);
    setCatalog(catalogResponse.items);
    setInstalled(Object.fromEntries(installedResponse.items.map((item) => [item.addonId, item])));
    const statuses = await Promise.all(
      catalogResponse.items.map(async (item) => [item.addonId, await fetchAddonStatus(item.addonId)] as const),
    );
    setStatusByAddonId(Object.fromEntries(statuses));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then(() => {
        if (!cancelled) {
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const sortedCatalog = useMemo(
    () => [...catalog].sort((left, right) => left.label.localeCompare(right.label)),
    [catalog],
  );

  const reloadAfterAction = useCallback(async (message: string) => {
    await load();
    setInfo(message);
    setError(null);
  }, [load]);

  const onInstall = useCallback(async (addon: AddonCatalogEntry) => {
    setBusyAddonId(addon.addonId);
    try {
      await installAddon(addon.addonId, {
        confirmRepoDownload: true,
        actorId: "operator",
      });
      await reloadAfterAction(`${addon.label} installed.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAddonId(null);
      setConfirmInstallAddon(null);
    }
  }, [reloadAfterAction]);

  const onUpdate = useCallback(async (addonId: string) => {
    setBusyAddonId(addonId);
    try {
      await updateAddon(addonId);
      await reloadAfterAction("Add-on updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAddonId(null);
    }
  }, [reloadAfterAction]);

  const onLaunch = useCallback(async (addonId: string) => {
    setBusyAddonId(addonId);
    try {
      await launchAddon(addonId);
      await reloadAfterAction("Add-on runtime started.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAddonId(null);
    }
  }, [reloadAfterAction]);

  const onStop = useCallback(async (addonId: string) => {
    setBusyAddonId(addonId);
    try {
      await stopAddon(addonId);
      await reloadAfterAction("Add-on runtime stopped.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAddonId(null);
    }
  }, [reloadAfterAction]);

  const onUninstall = useCallback(async (addon: AddonCatalogEntry) => {
    setBusyAddonId(addon.addonId);
    try {
      await uninstallAddon(addon.addonId);
      await reloadAfterAction(`${addon.label} uninstalled.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAddonId(null);
      setConfirmUninstallAddon(null);
    }
  }, [reloadAfterAction]);

  const openExternalAddon = useCallback((launchUrl: string) => {
    window.open(launchUrl, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <section className="card stack-page">
      {pageCopy.addons.guide ? <PageGuideCard {...pageCopy.addons.guide} /> : null}
      {info ? <p className="status-banner ok">{info}</p> : null}
      {error ? <p className="status-banner warning">{error}</p> : null}
      <div className="stack-list">
        {sortedCatalog.map((addon) => {
          const addonStatus = statusByAddonId[addon.addonId];
          const installedRecord = installed[addon.addonId];
          const effectiveStatus = addonStatus?.status ?? (installedRecord ? installedRecord.runtimeStatus : "not_installed");
          const effectiveLaunchUrl = addonStatus?.installed?.launchUrl ?? installedRecord?.launchUrl ?? addon.launchUrl;
          const busy = busyAddonId === addon.addonId;
          const canOpenExternally = effectiveStatus === "running" && Boolean(effectiveLaunchUrl);
          return (
            <article key={addon.addonId} className="stack-card">
              <div className="stack-card-header">
                <div>
                  <h3>{addon.label}</h3>
                  <p className="office-subtitle">{addon.description}</p>
                </div>
                <div className="stack-card-chips">
                  <span className="chip">{addon.category.replaceAll("_", " ")}</span>
                  <span className={`chip chip-${addon.trustTier}`}>{addon.trustTier}</span>
                  <span className={`chip chip-${effectiveStatus}`}>{effectiveStatus.replaceAll("_", " ")}</span>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <strong>Repository</strong>
                  <p className="office-subtitle">
                    {addon.repoUrl}
                    <HelpHint
                      label={`${addon.label} provenance`}
                      text={addon.sameOwnerAsGoatCitadel
                        ? "This add-on is configured as being owned by the same publisher as GoatCitadel, but it still downloads code from a separate repository."
                        : "This add-on comes from a separate repository and should be reviewed before install."}
                    />
                  </p>
                </div>
                <div>
                  <strong>Install location</strong>
                  <p className="office-subtitle">{installedRecord?.installedPath ?? "~/.GoatCitadel/addons/<addonId>"}</p>
                </div>
                <div>
                  <strong>Runtime type</strong>
                  <p className="office-subtitle">{addon.runtimeType.replaceAll("_", " ")}</p>
                </div>
                <div>
                  <strong>Display mode</strong>
                  <p className="office-subtitle">
                    {addon.webEntryMode === "external_local_url"
                      ? "Display-ready through a separate local browser tab once the add-on is running."
                      : addon.webEntryMode === "embedded_proxy"
                        ? "Display-ready through a GoatCitadel-managed embedded proxy surface."
                        : "Runtime-only add-on with no stable web entry."}
                  </p>
                </div>
                {effectiveLaunchUrl ? (
                  <div>
                    <strong>Launch URL</strong>
                    <p className="office-subtitle">{effectiveLaunchUrl}</p>
                  </div>
                ) : null}
              </div>

              <div className="action-row">
                {!installedRecord ? (
                  <ActionButton
                    label={busy ? "Installing..." : "Install"}
                    onClick={() => setConfirmInstallAddon(addon)}
                    disabled={busy}
                  />
                ) : (
                  <>
                    <ActionButton
                      label={busy ? "Updating..." : "Update"}
                      onClick={() => void onUpdate(addon.addonId)}
                      disabled={busy}
                    />
                    <ActionButton
                      label={effectiveStatus === "running" ? (busy ? "Stopping..." : "Stop") : (busy ? "Starting..." : "Start")}
                      onClick={() => {
                        if (effectiveStatus === "running") {
                          void onStop(addon.addonId);
                        } else {
                          void onLaunch(addon.addonId);
                        }
                      }}
                      disabled={busy}
                    />
                    {canOpenExternally && effectiveLaunchUrl ? (
                      <ActionButton
                        label={`Open ${addon.label}`}
                        onClick={() => openExternalAddon(effectiveLaunchUrl)}
                        disabled={busy}
                      />
                    ) : null}
                    <ActionButton
                      label="Uninstall"
                      onClick={() => setConfirmUninstallAddon(addon)}
                      disabled={busy}
                      danger
                    />
                  </>
                )}
              </div>

              <details className="inline-panel" open>
                <summary>Readiness checks</summary>
                <ul className="resource-link-list">
                  {(addonStatus?.healthChecks ?? addon.healthChecks).map((check) => (
                    <li key={`${addon.addonId}-${check.key}`}>
                      <strong>{check.key}</strong>: {check.message} <span className={`chip chip-${check.status}`}>{check.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </div>

      <ConfirmModal
        open={Boolean(confirmInstallAddon)}
        title={`Install ${confirmInstallAddon?.label ?? "add-on"}`}
        message={confirmInstallAddon
          ? `You are about to download code from another repository.\nRepository: ${confirmInstallAddon.repoUrl}\nOwner: ${confirmInstallAddon.owner}${confirmInstallAddon.sameOwnerAsGoatCitadel ? " (same owner as GoatCitadel)" : ""}\nThis add-on is optional and installs under ~/.GoatCitadel/addons/${confirmInstallAddon.addonId}.`
          : ""}
        confirmLabel="Download and install"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirmInstallAddon) {
            void onInstall(confirmInstallAddon);
          }
        }}
        onCancel={() => setConfirmInstallAddon(null)}
      />

      <ConfirmModal
        open={Boolean(confirmUninstallAddon)}
        title={`Uninstall ${confirmUninstallAddon?.label ?? "add-on"}`}
        message={confirmUninstallAddon
          ? `This removes the installed add-on code from ~/.GoatCitadel/addons/${confirmUninstallAddon.addonId}. GoatCitadel core code is not touched.`
          : ""}
        confirmLabel="Uninstall"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          if (confirmUninstallAddon) {
            void onUninstall(confirmUninstallAddon);
          }
        }}
        onCancel={() => setConfirmUninstallAddon(null)}
      />
    </section>
  );
}
