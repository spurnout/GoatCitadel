import { useCallback, useEffect, useMemo, useState } from "react";
import type { GuidanceDocType } from "@goatcitadel/contracts";
import {
  archiveWorkspace,
  createWorkspace,
  fetchGlobalGuidance,
  fetchWorkspaceGuidance,
  fetchWorkspaces,
  restoreWorkspace,
  updateGlobalGuidance,
  updateWorkspaceGuidance,
  type GuidanceDocumentRecord,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

const GLOBAL_GUIDANCE_DOC_TYPES: Array<{ value: GuidanceDocType; label: string }> = [
  { value: "goatcitadel", label: "GOATCITADEL.md" },
  { value: "agents", label: "AGENTS.md" },
  { value: "claude", label: "CLAUDE.md" },
  { value: "contributing", label: "CONTRIBUTING.md" },
  { value: "security", label: "SECURITY.md" },
  { value: "vision", label: "VISION.md" },
];

const WORKSPACE_GUIDANCE_DOC_TYPES: Array<{ value: GuidanceDocType; label: string }> = [
  { value: "goatcitadel", label: "GOATCITADEL.md" },
  { value: "agents", label: "AGENTS.md" },
  { value: "claude", label: "CLAUDE.md" },
  { value: "vision", label: "VISION.md" },
];

export function WorkspacesPage(props: {
  refreshKey?: number;
  activeWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
}) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFallbackRefreshing, setIsFallbackRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [docScope, setDocScope] = useState<"global" | "workspace">("workspace");
  const [docType, setDocType] = useState<GuidanceDocType>("goatcitadel");
  const [editorContent, setEditorContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Awaited<ReturnType<typeof fetchWorkspaces>>["items"]>([]);
  const [globalGuidance, setGlobalGuidance] = useState<GuidanceDocumentRecord[]>([]);
  const [workspaceGuidance, setWorkspaceGuidance] = useState<GuidanceDocumentRecord[]>([]);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [workspaceResponse, globalResponse, scopedGuidance] = await Promise.all([
        fetchWorkspaces("all", 300),
        fetchGlobalGuidance(),
        fetchWorkspaceGuidance(props.activeWorkspaceId),
      ]);
      setWorkspaces(workspaceResponse.items);
      setGlobalGuidance(globalResponse.items);
      setWorkspaceGuidance(scopedGuidance.workspace);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (background) {
        setIsRefreshing(false);
      } else {
        setIsInitialLoading(false);
      }
    }
  }, [props.activeWorkspaceId]);

  useEffect(() => {
    void load({ background: false });
  }, [load]);

  useRefreshSubscription(
    "system",
    async () => {
      await load({ background: true });
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1200,
      staleMs: 20000,
      pollIntervalMs: 15000,
      onFallbackStateChange: setIsFallbackRefreshing,
    },
  );

  const selectedDocument = useMemo(() => {
    const source = docScope === "global" ? globalGuidance : workspaceGuidance;
    return source.find((item) => item.docType === docType) ?? null;
  }, [docScope, docType, globalGuidance, workspaceGuidance]);

  const visibleDocTypes = useMemo(
    () => (docScope === "global" ? GLOBAL_GUIDANCE_DOC_TYPES : WORKSPACE_GUIDANCE_DOC_TYPES),
    [docScope],
  );

  useEffect(() => {
    if (visibleDocTypes.some((item) => item.value === docType)) {
      return;
    }
    setDocType(visibleDocTypes[0]?.value ?? "goatcitadel");
  }, [docType, visibleDocTypes]);

  useEffect(() => {
    setEditorContent(selectedDocument?.content ?? "");
    setDirty(false);
  }, [selectedDocument?.content, selectedDocument?.absolutePath]);

  const activeWorkspace = useMemo(
    () => workspaces.find((item) => item.workspaceId === props.activeWorkspaceId) ?? null,
    [props.activeWorkspaceId, workspaces],
  );

  const handleCreateWorkspace = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createWorkspace({
        name: workspaceName,
        slug: workspaceSlug || undefined,
        description: workspaceDescription || undefined,
      });
      setWorkspaceName("");
      setWorkspaceSlug("");
      setWorkspaceDescription("");
      props.onWorkspaceChange(created.workspaceId);
      setSuccess(`Workspace ${created.name} created.`);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  }, [load, props, workspaceDescription, workspaceName, workspaceSlug]);

  const handleArchiveWorkspace = useCallback(async (workspaceId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const archived = await archiveWorkspace(workspaceId);
      setSuccess(`Workspace ${archived.name} archived.`);
      if (archived.workspaceId === props.activeWorkspaceId) {
        props.onWorkspaceChange("default");
      }
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [load, props]);

  const handleRestoreWorkspace = useCallback(async (workspaceId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const restored = await restoreWorkspace(workspaceId);
      setSuccess(`Workspace ${restored.name} restored.`);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [load]);

  const handleSaveGuidance = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (docScope === "global") {
        await updateGlobalGuidance(docType, editorContent);
      } else {
        await updateWorkspaceGuidance(props.activeWorkspaceId, docType, editorContent);
      }
      setSuccess(`Saved ${docType} guidance (${docScope}).`);
      setDirty(false);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [docScope, docType, editorContent, load, props.activeWorkspaceId]);

  return (
    <section className="stack-lg">
      <PageGuideCard
        what={pageCopy.workspaces.guide?.what ?? ""}
        when={pageCopy.workspaces.guide?.when ?? ""}
        mostCommonAction={pageCopy.workspaces.guide?.mostCommonAction}
        actions={pageCopy.workspaces.guide?.actions ?? []}
        terms={pageCopy.workspaces.guide?.terms}
      />
      {isInitialLoading ? <p>Loading workspaces...</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing workspace data...</p> : null}
      {isFallbackRefreshing ? (
        <p className="status-banner warning">
          Live updates degraded, checking workspace data periodically.
        </p>
      ) : null}
      {error ? <p className="status-banner warning">{error}</p> : null}
      {success ? <p className="status-banner success">{success}</p> : null}

      <article className="card stack-md">
        <header className="row-between">
          <h3>Workspace Switcher</h3>
          <span className="status-chip">Active: {activeWorkspace?.name ?? props.activeWorkspaceId}</span>
        </header>
        <div className="split-grid">
          <ul className="compact-list">
            {workspaces.map((workspace) => (
              <li key={workspace.workspaceId} className={workspace.workspaceId === props.activeWorkspaceId ? "active-item" : ""}>
                <div>
                  <strong>{workspace.name}</strong>
                  <p className="office-subtitle">{workspace.slug} • {workspace.lifecycleStatus}</p>
                </div>
                <div className="row-actions">
                  <ActionButton
                    label={workspace.workspaceId === props.activeWorkspaceId ? "Selected" : "Use"}
                    disabled={workspace.workspaceId === props.activeWorkspaceId}
                    onClick={() => props.onWorkspaceChange(workspace.workspaceId)}
                  />
                  {workspace.lifecycleStatus === "active" && workspace.workspaceId !== "default" ? (
                    <ActionButton label="Archive" danger onClick={() => void handleArchiveWorkspace(workspace.workspaceId)} />
                  ) : null}
                  {workspace.lifecycleStatus === "archived" ? (
                    <ActionButton label="Restore" onClick={() => void handleRestoreWorkspace(workspace.workspaceId)} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="stack-sm">
            <h4>Create Workspace</h4>
            <label className="field">
              Name
              <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Personal" />
            </label>
            <label className="field">
              Slug (optional)
              <input value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} placeholder="personal" />
            </label>
            <label className="field">
              Description (optional)
              <textarea value={workspaceDescription} onChange={(event) => setWorkspaceDescription(event.target.value)} rows={4} />
            </label>
            <ActionButton
              label={isCreating ? "Creating..." : "Create workspace"}
              disabled={isCreating || !workspaceName.trim()}
              onClick={() => void handleCreateWorkspace()}
            />
          </div>
        </div>
      </article>

      <article className="card stack-md">
        <header className="row-between">
          <h3>Guidance Editor</h3>
          <span className="office-subtitle">
            {docScope === "workspace" ? `Workspace override (${props.activeWorkspaceId})` : "Global default"}
          </span>
        </header>
        <div className="row-actions">
          <label className="field compact">
            Scope
            <select value={docScope} onChange={(event) => setDocScope(event.target.value as "global" | "workspace")}>
              <option value="workspace">Workspace</option>
              <option value="global">Global</option>
            </select>
          </label>
          <label className="field compact">
            Document
            <select value={docType} onChange={(event) => setDocType(event.target.value as GuidanceDocType)}>
              {visibleDocTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <ActionButton label={isSaving ? "Saving..." : "Save guidance"} disabled={isSaving || !dirty} onClick={() => void handleSaveGuidance()} />
        </div>
        <p className="office-subtitle">
          File: <code>{selectedDocument?.absolutePath ?? "not created yet"}</code>
        </p>
        <textarea
          value={editorContent}
          onChange={(event) => {
            setEditorContent(event.target.value);
            setDirty(true);
          }}
          rows={20}
          placeholder="Write guidance markdown here..."
        />
      </article>
    </section>
  );
}
