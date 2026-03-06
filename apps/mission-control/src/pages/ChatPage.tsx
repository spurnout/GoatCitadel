import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type {
  ChatAttachmentRecord,
  ChatCapabilityUpgradeSuggestion,
  ChatDelegationSuggestionRecord,
  ChatMessageRecord,
  ChatSessionPrefsPatch,
  ChatSessionBindingRecord,
  ChatSessionPrefsRecord,
  ChatSessionRecord,
  ChatTurnTraceRecord,
  LearnedMemoryItemRecord,
  ProactivePolicy,
  ProactiveRunRecord,
} from "@goatcitadel/contracts";
import {
  acceptChatDelegation,
  approveChatTool,
  archiveChatSession,
  assignChatSessionProject,
  createMcpServer,
  createChatProject,
  createChatSession,
  denyChatTool,
  fetchChatCommandCatalog,
  fetchChatMessages,
  fetchChatProactiveRuns,
  fetchChatProactiveStatus,
  fetchChatProjects,
  fetchChatSessionBinding,
  fetchChatLearnedMemory,
  fetchChatSessionPrefs,
  fetchChatSessions,
  fetchMcpTemplates,
  fetchSettings,
  installSkillImport,
  parseChatCommand,
  rebuildChatLearnedMemory,
  pinChatSession,
  restoreChatSession,
  runChatResearch,
  sendAgentChatMessage,
  triggerChatProactive,
  updateChatProactivePolicy,
  setChatSessionBinding,
  suggestChatDelegation,
  streamAgentChatMessage,
  unpinChatSession,
  updateChatSession,
  updateChatLearnedMemoryItem,
  updateChatSessionPrefs,
  updateSkillState,
  uploadChatAttachment,
  type ChatMessagesResponse,
  type ChatProjectsResponse,
  type ChatSessionsResponse,
  type RuntimeSettingsResponse,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { CardSkeleton } from "../components/CardSkeleton";
import { ChatComposerPlusMenu } from "../components/ChatComposerPlusMenu";
import { ChatModeSwitch } from "../components/ChatModeSwitch";
import { ChatModelPicker, type ChatModelProviderOption } from "../components/ChatModelPicker";
import { ChatTraceCard } from "../components/ChatTraceCard";
import { CoworkCanvasPanel } from "../components/CoworkCanvasPanel";
import { HelpHint } from "../components/HelpHint";
import { InlineApprovalPrompt } from "../components/InlineApprovalPrompt";
import { GCCombobox, GCSelect, GCSwitch } from "../components/ui";
import { useProviderModelCatalog } from "../hooks/useProviderModelCatalog";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";
import { pageCopy } from "../content/copy";

const STREAM_PREF_KEY = "goatcitadel.chat.agent.stream.enabled";

interface PendingApprovalState {
  approvalId: string;
  toolName?: string;
  reason?: string;
}

interface CommandCatalogItem {
  command: string;
  usage: string;
  description: string;
}

export function ChatPage({ workspaceId = "default" }: { workspaceId?: string }) {
  const [projects, setProjects] = useState<ChatProjectsResponse | null>(null);
  const [sessions, setSessions] = useState<ChatSessionsResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessagesResponse["items"]>([]);
  const [prefs, setPrefs] = useState<ChatSessionPrefsRecord | null>(null);
  const [binding, setBinding] = useState<ChatSessionBindingRecord | null>(null);
  const [settings, setSettings] = useState<RuntimeSettingsResponse | null>(null);
  const [commandCatalog, setCommandCatalog] = useState<CommandCatalogItem[]>([]);
  const [latestTrace, setLatestTrace] = useState<ChatTurnTraceRecord | null>(null);
  const [capabilitySuggestions, setCapabilitySuggestions] = useState<ChatCapabilityUpgradeSuggestion[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalState | null>(null);
  const [proactiveStatus, setProactiveStatus] = useState<ProactivePolicy | null>(null);
  const [proactiveRuns, setProactiveRuns] = useState<ProactiveRunRecord[]>([]);
  const [learnedMemory, setLearnedMemory] = useState<LearnedMemoryItemRecord[]>([]);
  const [delegationSuggestion, setDelegationSuggestion] = useState<ChatDelegationSuggestionRecord | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachmentRecord[]>([]);
  const [streamEnabled, setStreamEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(STREAM_PREF_KEY);
    return raw === null ? true : raw === "true";
  });
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("chat/default");
  const [renameTitle, setRenameTitle] = useState("");
  const [integrationConnectionId, setIntegrationConnectionId] = useState("");
  const [integrationTarget, setIntegrationTarget] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [approvalPending, setApprovalPending] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLUListElement | null>(null);
  const dragDepthRef = useRef(0);
  const initializedRef = useRef(false);
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const shouldFollowMessagesRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const messageMutationVersionRef = useRef(0);
  const lastLocalPrefMutationAtRef = useRef(0);
  const {
    config: runtimeLlmConfig,
    providers: runtimeProviderCatalog,
    loadModelsForProvider,
  } = useProviderModelCatalog("chat");

  const loadSidebar = useCallback(async () => {
    const [nextProjects, nextSessions] = await Promise.all([
      fetchChatProjects("all", 500, workspaceId),
      fetchChatSessions({ scope: "all", view: "all", limit: 500, workspaceId }),
    ]);
    setProjects(nextProjects);
    setSessions(nextSessions);
    setSelectedSessionId((current) => current ?? nextSessions.items[0]?.sessionId ?? null);
  }, [workspaceId]);

  const loadRuntimeCatalog = useCallback(async () => {
    const [runtimeSettings, commands] = await Promise.all([fetchSettings(), fetchChatCommandCatalog()]);
    setSettings(runtimeSettings);
    setCommandCatalog(commands.items);
  }, []);

  useEffect(() => {
    if (!runtimeLlmConfig) {
      return;
    }
    setSettings((current) => current ? { ...current, llm: runtimeLlmConfig } : current);
  }, [runtimeLlmConfig]);

  const commitMessageUpdate = useCallback((
    updater: ChatMessagesResponse["items"] | ((current: ChatMessagesResponse["items"]) => ChatMessagesResponse["items"]),
  ) => {
    messageMutationVersionRef.current += 1;
    if (typeof updater === "function") {
      setMessages((current) => updater(current));
      return;
    }
    setMessages(updater);
  }, []);

  const applyFetchedMessages = useCallback((
    items: ChatMessagesResponse["items"],
    requestVersion: number | null,
  ) => {
    if (requestVersion !== null && requestVersion !== messageMutationVersionRef.current) {
      return false;
    }
    commitMessageUpdate(items);
    return true;
  }, [commitMessageUpdate]);

  const loadSessionCoreState = useCallback(async (
    sessionId: string,
    options: {
      background?: boolean;
      includeMessages?: boolean;
    } = {},
  ) => {
    const background = options.background ?? false;
    const includeMessages = options.includeMessages ?? true;
    const messageVersionAtStart = includeMessages ? messageMutationVersionRef.current : null;
    if (!background) {
      setMessagesLoading(true);
    }
    try {
      const [nextMessages, nextBinding, nextPrefs] = await Promise.all([
        includeMessages ? fetchChatMessages(sessionId, 500) : Promise.resolve(undefined),
        fetchChatSessionBinding(sessionId),
        fetchChatSessionPrefs(sessionId),
      ]);
      if (nextMessages) {
        applyFetchedMessages(nextMessages.items, messageVersionAtStart);
      }
      setBinding(nextBinding.item);
      setPrefs(nextPrefs);
    } finally {
      if (!background) {
        setMessagesLoading(false);
      }
    }
  }, [applyFetchedMessages]);

  const loadSessionSecondaryState = useCallback(async (
    sessionId: string,
    options: {
      background?: boolean;
    } = {},
  ) => {
    const background = options.background ?? false;
    if (!background) {
      setSecondaryLoading(true);
    }
    try {
      const [nextProactiveStatus, nextProactiveRuns, nextMemory] = await Promise.all([
        fetchChatProactiveStatus(sessionId),
        fetchChatProactiveRuns(sessionId, 30),
        fetchChatLearnedMemory(sessionId, 80),
      ]);
      setProactiveStatus(nextProactiveStatus.policy);
      setProactiveRuns(nextProactiveRuns.items);
      setLearnedMemory(nextMemory.items);
    } finally {
      if (!background) {
        setSecondaryLoading(false);
      }
    }
  }, []);

  const loadSessionState = useCallback(async (
    sessionId: string,
    options: {
      background?: boolean;
      includeMessages?: boolean;
      deferSecondary?: boolean;
    } = {},
  ) => {
    const background = options.background ?? false;
    const includeMessages = options.includeMessages ?? true;
    const deferSecondary = options.deferSecondary ?? false;
    await loadSessionCoreState(sessionId, { background, includeMessages });
    if (deferSecondary) {
      void loadSessionSecondaryState(sessionId, { background: false }).catch((err: Error) => setError(err.message));
      return;
    }
    await loadSessionSecondaryState(sessionId, { background });
  }, [loadSessionCoreState, loadSessionSecondaryState]);

  const refreshViewState = useCallback(async (
    options: {
      refreshSidebar?: boolean;
      refreshSession?: "none" | "light" | "full";
    } = {},
  ) => {
    if (!initializedRef.current) {
      return;
    }
    const shouldRefreshSidebar = options.refreshSidebar ?? true;
    const refreshSession = options.refreshSession ?? "light";
    if (!shouldRefreshSidebar && refreshSession === "none") {
      return;
    }
    setIsRefreshing(true);
    try {
      if (shouldRefreshSidebar) {
        await loadSidebar();
      }
      if (selectedSessionId && refreshSession !== "none") {
        if (refreshSession === "full") {
          await loadSessionState(selectedSessionId, {
            background: true,
            includeMessages: true,
          });
        } else {
          await loadSessionSecondaryState(selectedSessionId, {
            background: true,
          });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadSessionSecondaryState, loadSessionState, loadSidebar, selectedSessionId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadSidebar(), loadRuntimeCatalog()])
      .then(() => !cancelled && setError(null))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          initializedRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadRuntimeCatalog, loadSidebar]);

  useRefreshSubscription(
    "chat",
    async (signal) => {
      const now = Date.now();
      const haystack = `${signal.reason} ${signal.eventType ?? ""} ${signal.source ?? ""}`.toLowerCase();
      if (signal.eventType === "fallback_poll") {
        await refreshViewState({
          refreshSidebar: true,
          refreshSession: "light",
        });
        return;
      }
      const localPrefEcho = now - lastLocalPrefMutationAtRef.current < 2500
        && /\b(pref|policy|session|proactive|retrieval|reflection|mode)\b/.test(haystack);
      const mentionsMessages = /\b(message|turn|assistant|user|tool|trace|approval)\b/.test(haystack);
      const affectsSidebar = /\b(project|archive|restore|pin|unpin|binding|workspace|external|session_created|session_deleted)\b/.test(haystack);
      const mentionsSessionState = /\b(pref|policy|proactive|retrieval|reflection|mode|learned_memory)\b/.test(haystack);
      const refreshSession = localPrefEcho
        ? "none"
        : (mentionsMessages ? "full" : (mentionsSessionState ? "light" : "none"));
      await refreshViewState({
        refreshSidebar: affectsSidebar,
        refreshSession,
      });
    },
    {
      enabled: !loading,
      coalesceMs: 800,
      staleMs: 20000,
      pollIntervalMs: 15000,
    },
  );

  useEffect(() => {
    if (!selectedSessionId) {
      commitMessageUpdate([]);
      setPrefs(null);
      setBinding(null);
      setProactiveStatus(null);
      setProactiveRuns([]);
      setLearnedMemory([]);
      setSecondaryLoading(false);
      setDelegationSuggestion(null);
      setPendingAttachments([]);
      lastLoadedSessionIdRef.current = null;
      return;
    }
    if (lastLoadedSessionIdRef.current !== selectedSessionId) {
      setPendingAttachments([]);
      setLatestTrace(null);
      setPendingApproval(null);
      lastLoadedSessionIdRef.current = selectedSessionId;
    }
    setDelegationSuggestion(null);
    setLatestTrace(null);
    setCapabilitySuggestions([]);
    setPendingApproval(null);
    void loadSessionState(selectedSessionId, {
      background: false,
      includeMessages: true,
      deferSecondary: true,
    }).catch((err: Error) => setError(err.message));
  }, [commitMessageUpdate, loadSessionState, selectedSessionId]);

  useEffect(() => {
    shouldFollowMessagesRef.current = true;
    previousMessageCountRef.current = 0;
  }, [selectedSessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STREAM_PREF_KEY, String(streamEnabled));
  }, [streamEnabled]);

  const selectedSession = useMemo(
    () => sessions?.items.find((item) => item.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions?.items],
  );

  useEffect(() => {
    setRenameTitle(selectedSession?.title ?? "");
  }, [selectedSession?.sessionId, selectedSession?.title]);

  const visibleSessions = useMemo(() => {
    const all = sessions?.items ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((item) => {
      if (selectedProjectId !== "all") {
        if (selectedProjectId === "none") {
          if (item.projectId) return false;
        } else if (item.projectId !== selectedProjectId) {
          return false;
        }
      }
      if (!q) return true;
      const haystack = [item.title, item.sessionKey, item.projectName, item.channel, item.account].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [search, selectedProjectId, sessions?.items]);

  const missionSessions = useMemo(
    () => visibleSessions.filter((item) => item.scope === "mission"),
    [visibleSessions],
  );

  const externalSessions = useMemo(
    () => visibleSessions.filter((item) => item.scope === "external"),
    [visibleSessions],
  );

  const providerOptions = useMemo<ChatModelProviderOption[]>(() => {
    const activeProviderId = runtimeLlmConfig?.activeProviderId ?? settings?.llm.activeProviderId;
    const activeModel = runtimeLlmConfig?.activeModel ?? settings?.llm.activeModel;
    return runtimeProviderCatalog.map((provider) => ({
      providerId: provider.providerId,
      label: provider.label,
      models: dedupeStrings([
        ...provider.models,
        provider.providerId === activeProviderId ? activeModel : undefined,
        prefs?.providerId === provider.providerId ? prefs.model : undefined,
      ]),
    }));
  }, [
    prefs?.model,
    prefs?.providerId,
    runtimeLlmConfig?.activeModel,
    runtimeLlmConfig?.activeProviderId,
    runtimeProviderCatalog,
    settings?.llm.activeModel,
    settings?.llm.activeProviderId,
  ]);

  const selectedProviderId = prefs?.providerId ?? runtimeLlmConfig?.activeProviderId ?? settings?.llm.activeProviderId;

  useEffect(() => {
    if (!selectedProviderId) {
      return;
    }
    void loadModelsForProvider(selectedProviderId);
  }, [loadModelsForProvider, selectedProviderId]);

  const commandSuggestions = useMemo(() => {
    if (!draft.trimStart().startsWith("/")) return [] as CommandCatalogItem[];
    const query = draft.trim().slice(1).toLowerCase();
    if (!query) return commandCatalog.slice(0, 8);
    return commandCatalog
      .filter((item) => `${item.command} ${item.usage} ${item.description}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [commandCatalog, draft]);

  useEffect(() => setCommandIndex(0), [draft]);

  const selectedSessionProjectValue = selectedSession?.projectId ?? "none";
  const messageMode = prefs?.mode ?? "chat";
  const coworkItems = useMemo(() => deriveCoworkItems(messages), [messages]);
  const canSend = Boolean(draft.trim()) && !sending;

  const ensureSession = useCallback(async (): Promise<ChatSessionRecord> => {
    if (selectedSession) return selectedSession;
    const created = await createChatSession(
      selectedProjectId !== "all" && selectedProjectId !== "none"
        ? { workspaceId, projectId: selectedProjectId }
        : { workspaceId },
    );
    await loadSidebar();
    setSelectedSessionId(created.sessionId);
    return created;
  }, [loadSidebar, selectedProjectId, selectedSession, workspaceId]);

  const uploadAttachments = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setSending(true);
    try {
      const session = await ensureSession();
      const uploaded: ChatAttachmentRecord[] = [];
      for (const file of files) {
        uploaded.push(await uploadChatAttachment({
          sessionId: session.sessionId,
          projectId: session.projectId,
          file,
        }));
      }
      setPendingAttachments((current) => [...current, ...uploaded]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [ensureSession]);

  const handleRunQuickResearch = useCallback(async () => {
    if (sending) return;
    const session = await ensureSession();
    const query = draft.trim() || messages.filter((item) => item.role === "user").at(-1)?.content || "";
    if (!query) {
      setError("Enter a query first or send a user message before research.");
      return;
    }
    setSending(true);
    try {
      const summary = await runChatResearch(session.sessionId, {
        query,
        mode: prefs?.webMode === "deep" ? "deep" : "quick",
        providerId: prefs?.providerId,
        model: prefs?.model,
      });
      const synthetic: ChatMessageRecord = {
        messageId: `research-${summary.runId}`,
        sessionId: session.sessionId,
        role: "assistant",
        actorType: "system",
        actorId: "research",
        content: `Research summary:\n${summary.summary}\n\nSources: ${summary.sources.length}`,
        timestamp: new Date().toISOString(),
      };
      commitMessageUpdate((current) => [...current, synthetic]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [commitMessageUpdate, draft, ensureSession, messages, prefs?.model, prefs?.providerId, prefs?.webMode, sending]);

  const handleProactivePolicyPatch = useCallback(async (
    patch: {
      proactiveMode?: "off" | "suggest" | "auto_safe";
      autonomyBudget?: {
        maxActionsPerHour?: number;
        maxActionsPerTurn?: number;
        cooldownSeconds?: number;
      };
      retrievalMode?: "standard" | "layered";
      reflectionMode?: "off" | "on";
    },
  ) => {
    if (!selectedSession) return;
    lastLocalPrefMutationAtRef.current = Date.now();
    try {
      const updated = await updateChatProactivePolicy(selectedSession.sessionId, patch);
      setProactiveStatus(updated);
      setPrefs((current) => current ? {
        ...current,
        proactiveMode: updated.mode,
        autonomyBudget: updated.autonomyBudget,
        retrievalMode: updated.retrievalMode,
        reflectionMode: updated.reflectionMode,
      } : current);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedSession]);

  const handleTriggerProactive = useCallback(async () => {
    if (!selectedSession || sending) return;
    setSending(true);
    try {
      const run = await triggerChatProactive(selectedSession.sessionId, {
        source: "manual",
        reason: "Operator triggered from chat workspace.",
      });
      setProactiveRuns((current) => [run, ...current].slice(0, 30));
      commitMessageUpdate((current) => [...current, {
        messageId: `proactive-${run.runId}`,
        sessionId: selectedSession.sessionId,
        role: "system",
        actorType: "system",
        actorId: "proactive",
        content: `Proactive run ${run.status}: ${run.reasoningSummary}`,
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [selectedSession, sending]);

  const handleSuggestDelegation = useCallback(async () => {
    if (!selectedSession || sending) return;
    const objective = draft.trim() || messages.filter((item) => item.role === "user").at(-1)?.content?.trim() || "";
    if (!objective) {
      setError("Write a request first so I can suggest a delegation plan.");
      return;
    }
    setSending(true);
    try {
      const suggested = await suggestChatDelegation(selectedSession.sessionId, { objective });
      setDelegationSuggestion(suggested.suggestion);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [draft, messages, selectedSession, sending]);

  const handleAcceptDelegation = useCallback(async () => {
    if (!selectedSession || !delegationSuggestion || sending) return;
    setSending(true);
    try {
      const accepted = await acceptChatDelegation(selectedSession.sessionId, {
        suggestionId: delegationSuggestion.suggestionId,
        objective: delegationSuggestion.objective,
        roles: delegationSuggestion.roles,
        mode: delegationSuggestion.mode,
        providerId: prefs?.providerId,
        model: prefs?.model,
      });
      commitMessageUpdate((current) => [...current, {
        messageId: `delegation-${accepted.runId}`,
        sessionId: selectedSession.sessionId,
        role: "assistant",
        actorType: "agent",
        actorId: "delegation",
        content: accepted.stitchedOutput,
        timestamp: new Date().toISOString(),
      }]);
      setDelegationSuggestion(null);
      await loadSidebar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [commitMessageUpdate, delegationSuggestion, loadSidebar, prefs?.model, prefs?.providerId, selectedSession, sending]);

  const handleMemoryStatusUpdate = useCallback(async (
    itemId: string,
    status: "active" | "superseded" | "conflict" | "disabled",
  ) => {
    if (!selectedSession) return;
    try {
      const updated = await updateChatLearnedMemoryItem(selectedSession.sessionId, itemId, { status });
      setLearnedMemory((current) => current.map((item) => item.itemId === itemId ? updated : item));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedSession]);

  const handleRebuildLearnedMemory = useCallback(async () => {
    if (!selectedSession || sending) return;
    setSending(true);
    try {
      const rebuilt = await rebuildChatLearnedMemory(selectedSession.sessionId);
      setLearnedMemory(rebuilt.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [selectedSession, sending]);

  const handleComposerPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      void uploadAttachments(files);
      return;
    }
    const itemFiles = Array.from(event.clipboardData.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (itemFiles.length > 0) {
      event.preventDefault();
      void uploadAttachments(itemFiles);
    }
  }, [uploadAttachments]);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) void uploadAttachments(files);
  }, [uploadAttachments]);

  const handleMessageListScroll = useCallback(() => {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    shouldFollowMessagesRef.current = distanceFromBottom <= 56;
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || messagesLoading) return;

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const nearBottom = distanceFromBottom <= 56;
    const shouldFollow = shouldFollowMessagesRef.current || nearBottom;
    const appendedMessage = messages.length > previousMessageCountRef.current;

    if (shouldFollow) {
      list.scrollTo({
        top: list.scrollHeight,
        behavior: appendedMessage ? "smooth" : "auto",
      });
    }

    previousMessageCountRef.current = messages.length;
  }, [messages, messagesLoading]);

  const applyDraftCommand = useCallback((command: string) => {
    setDraft(`${command} `);
    composerRef.current?.focus();
  }, []);

  const appendLocalSystemMessage = useCallback((content: string) => {
    if (!selectedSessionId) {
      return;
    }
    commitMessageUpdate((current) => [...current, {
      messageId: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: selectedSessionId,
      role: "system",
      actorType: "system",
      actorId: "capability",
      content,
      timestamp: new Date().toISOString(),
    }]);
  }, [commitMessageUpdate, selectedSessionId]);

  const dismissCapabilitySuggestion = useCallback((suggestion: ChatCapabilityUpgradeSuggestion) => {
    setCapabilitySuggestions((current) => current.filter((item) => (
      item.kind !== suggestion.kind
      || (item.candidateId ?? item.title) !== (suggestion.candidateId ?? suggestion.title)
    )));
  }, []);

  const handleCapabilitySuggestionAction = useCallback(async (suggestion: ChatCapabilityUpgradeSuggestion) => {
    try {
      setError(null);
      if (suggestion.recommendedAction === "enable_skill") {
        if (!suggestion.candidateId) {
          throw new Error("This suggestion is missing the installed skill identifier.");
        }
        const confirmed = window.confirm(`Enable ${suggestion.title}?`);
        if (!confirmed) {
          return;
        }
        const updated = await updateSkillState(suggestion.candidateId, {
          state: "enabled",
          note: "Enabled from chat capability suggestion.",
        });
        appendLocalSystemMessage(`Enabled skill ${updated.skillId}. You can retry the request now.`);
        dismissCapabilitySuggestion(suggestion);
        return;
      }

      if (suggestion.recommendedAction === "install_skill_disabled") {
        if (!suggestion.sourceRef) {
          throw new Error("This suggestion is missing the import source.");
        }
        const confirmed = window.confirm(
          `${suggestion.title}\n\nInstall this skill in disabled state for review first?`,
        );
        if (!confirmed) {
          return;
        }
        const installed = await installSkillImport({
          sourceRef: suggestion.sourceRef,
          sourceProvider: suggestion.sourceProvider && suggestion.sourceProvider !== "mcp_template"
            ? suggestion.sourceProvider
            : undefined,
          confirmHighRisk: suggestion.riskLevel === "high",
        });
        appendLocalSystemMessage(
          installed.installedSkillId
            ? `Installed ${installed.installedSkillId}. It remains disabled by default until you enable it.`
            : "Installed the suggested skill. It remains disabled by default until you enable it.",
        );
        dismissCapabilitySuggestion(suggestion);
        window.location.hash = "skills";
        return;
      }

      if (suggestion.recommendedAction === "add_mcp_template") {
        const templateId = suggestion.candidateId ?? suggestion.sourceRef;
        if (!templateId) {
          throw new Error("This suggestion is missing the MCP template identifier.");
        }
        const confirmed = window.confirm(`Add MCP template "${suggestion.title}" now?`);
        if (!confirmed) {
          return;
        }
        const templates = await fetchMcpTemplates();
        const template = templates.items.find((item) => item.templateId === templateId);
        if (!template) {
          throw new Error("The suggested MCP template is no longer available.");
        }
        if (template.installed) {
          appendLocalSystemMessage(`${template.label} is already installed. Review it in MCP Servers.`);
          dismissCapabilitySuggestion(suggestion);
          window.location.hash = "mcp";
          return;
        }
        await createMcpServer({
          label: template.label,
          transport: template.transport,
          command: template.command,
          args: template.args,
          url: template.url,
          authType: template.authType,
          enabled: template.enabledByDefault,
          category: template.category,
          trustTier: template.trustTier,
          costTier: template.costTier,
          policy: template.policy,
        });
        appendLocalSystemMessage(`${template.label} was added. Review trust/auth details in MCP before first live use.`);
        dismissCapabilitySuggestion(suggestion);
        window.location.hash = "mcp";
        return;
      }

      if (suggestion.recommendedAction === "switch_tool_profile") {
        appendLocalSystemMessage("This request is blocked by the current tool/profile policy. Review Tool Access and retry.");
        window.location.hash = "tools";
        return;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [appendLocalSystemMessage, dismissCapabilitySuggestion]);

  const handleCommandExecution = useCallback(async (sessionId: string, commandText: string) => {
    const result = await parseChatCommand(sessionId, commandText);
    if (result.prefs) setPrefs(result.prefs);
    const echo: ChatMessageRecord = {
      messageId: `command-${Date.now()}`,
      sessionId,
      role: "system",
      actorType: "system",
      actorId: "slash",
      content: formatCommandResult(result),
      timestamp: new Date().toISOString(),
    };
    commitMessageUpdate((current) => [...current, echo]);
    if (result.command === "/project") await loadSidebar();
  }, [commitMessageUpdate, loadSidebar]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    const attachmentsSnapshot = pendingAttachments;
    const attachmentIds = attachmentsSnapshot.map((item) => item.attachmentId);
    const localAttachments = attachmentsSnapshot.map((item) => ({
      attachmentId: item.attachmentId,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    }));
    setDraft("");
    setPendingAttachments([]);
    setPendingApproval(null);

    let localUserId: string | null = null;
    let placeholderId: string | null = null;
    let committed = false;
    try {
      const session = await ensureSession();
      if (content.startsWith("/")) {
        await handleCommandExecution(session.sessionId, content);
        committed = true;
        await loadSidebar();
        return;
      }

      localUserId = `local-user-${Date.now()}`;
      commitMessageUpdate((current) => [...current, {
        messageId: localUserId!,
        sessionId: session.sessionId,
        role: "user",
        actorType: "user",
        actorId: "operator",
        content,
        timestamp: new Date().toISOString(),
        attachments: localAttachments.length > 0 ? localAttachments : undefined,
      }]);

      const payload = {
        content,
        attachments: attachmentIds,
        useMemory: (prefs?.memoryMode ?? "auto") !== "off",
        mode: prefs?.mode ?? "chat",
        providerId: prefs?.providerId,
        model: prefs?.model,
        webMode: prefs?.webMode ?? "auto",
        memoryMode: prefs?.memoryMode ?? "auto",
        thinkingLevel: prefs?.thinkingLevel ?? "standard",
      } as const;

      if (streamEnabled) {
        placeholderId = `stream-${Date.now()}`;
        commitMessageUpdate((current) => [...current, {
          messageId: placeholderId!,
          sessionId: session.sessionId,
          role: "assistant",
          actorType: "agent",
          actorId: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
        }]);
        await streamAgentChatMessage(session.sessionId, payload, (chunk) => {
          if (chunk.type === "delta" && chunk.delta) {
            commitMessageUpdate((current) => current.map((item) => item.messageId === placeholderId
              ? { ...item, content: `${item.content}${chunk.delta}` }
              : item));
            return;
          }
          if (chunk.type === "message_done") {
            commitMessageUpdate((current) => current.map((item) => item.messageId === placeholderId
              ? { ...item, content: chunk.content || item.content }
              : item));
            return;
          }
          if (chunk.type === "trace_update" && chunk.trace) {
            setLatestTrace(chunk.trace);
            setCapabilitySuggestions(chunk.trace.capabilityUpgradeSuggestions ?? []);
            return;
          }
          if (chunk.type === "capability_upgrade_suggestion") {
            setCapabilitySuggestions(chunk.capabilityUpgradeSuggestions ?? []);
            return;
          }
          if (chunk.type === "approval_required" && chunk.approval?.approvalId) {
            setPendingApproval({ approvalId: chunk.approval.approvalId, toolName: chunk.approval.toolName, reason: chunk.approval.reason });
            return;
          }
          if (chunk.type === "error") setError(chunk.error || "Streaming request failed.");
        });
        await loadSessionCoreState(session.sessionId, {
          background: true,
          includeMessages: true,
        });
        committed = true;
      } else {
        const sent = await sendAgentChatMessage(session.sessionId, payload);
        committed = true;
        commitMessageUpdate((current) => current.map((item) => item.messageId === localUserId ? sent.userMessage : item));
        if (sent.assistantMessage) commitMessageUpdate((current) => [...current, sent.assistantMessage as ChatMessageRecord]);
        if (sent.trace) {
          setLatestTrace(sent.trace);
          setCapabilitySuggestions(sent.trace.capabilityUpgradeSuggestions ?? []);
        }
      }

      await loadSidebar();
    } catch (err) {
      if (placeholderId) commitMessageUpdate((current) => current.filter((item) => item.messageId !== placeholderId));
      if (!committed) {
        if (localUserId) commitMessageUpdate((current) => current.filter((item) => item.messageId !== localUserId));
        setDraft((current) => (current.trim().length > 0 ? current : content));
        setPendingAttachments((current) => (current.length > 0 ? current : attachmentsSnapshot));
      }
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [commitMessageUpdate, draft, ensureSession, handleCommandExecution, loadSessionCoreState, loadSessionState, loadSidebar, pendingAttachments, prefs?.memoryMode, prefs?.mode, prefs?.model, prefs?.providerId, prefs?.thinkingLevel, prefs?.webMode, sending, streamEnabled]);

  const handleComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (commandSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCommandIndex((current) => Math.min(current + 1, commandSuggestions.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCommandIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const suggestion = commandSuggestions[commandIndex];
        if (suggestion) applyDraftCommand(suggestion.command);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [applyDraftCommand, commandIndex, commandSuggestions, handleSend]);

  const handleApprovePending = useCallback(async () => {
    if (!selectedSession || !pendingApproval) return;
    setApprovalPending(true);
    try {
      await approveChatTool(selectedSession.sessionId, pendingApproval.approvalId);
      commitMessageUpdate((current) => [...current, {
        messageId: `approval-ok-${Date.now()}`,
        sessionId: selectedSession.sessionId,
        role: "system",
        actorType: "system",
        actorId: "approval",
        content: `Approved request ${pendingApproval.approvalId}. Send your message again and I will continue.`,
        timestamp: new Date().toISOString(),
      }]);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovalPending(false);
    }
  }, [commitMessageUpdate, pendingApproval, selectedSession]);

  const handleDenyPending = useCallback(async () => {
    if (!selectedSession || !pendingApproval) return;
    setApprovalPending(true);
    try {
      await denyChatTool(selectedSession.sessionId, pendingApproval.approvalId);
      commitMessageUpdate((current) => [...current, {
        messageId: `approval-deny-${Date.now()}`,
        sessionId: selectedSession.sessionId,
        role: "system",
        actorType: "system",
        actorId: "approval",
        content: `Denied request ${pendingApproval.approvalId}. No action was taken.`,
        timestamp: new Date().toISOString(),
      }]);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovalPending(false);
    }
  }, [commitMessageUpdate, pendingApproval, selectedSession]);

  const handlePrefPatch = useCallback(async (patch: ChatSessionPrefsPatch) => {
    if (!selectedSession) return;
    lastLocalPrefMutationAtRef.current = Date.now();
    try {
      const updated = await updateChatSessionPrefs(selectedSession.sessionId, patch);
      setPrefs(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedSession]);

  if (loading) {
    return (
      <section>
        <h2>{pageCopy.chat.title}</h2>
        <CardSkeleton lines={8} />
      </section>
    );
  }

  return (
    <section className="chat-v11">
      <header className="chat-v11-header">
        <div>
          <h2>{pageCopy.chat.title}</h2>
          <p className="office-subtitle">{pageCopy.chat.subtitle}</p>
        </div>
        <HelpHint
          label="Chat workspace help"
          text="Use slash commands for quick control, switch mode and model from the top bar, and open trace only when you want the details."
        />
      </header>
      {error ? <p className="error">{error}</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing chat context...</p> : null}

      <div className="chat-v11-shell">
        <aside className="card chat-v11-left">
          <div className="chat-v11-left-head">
            <ActionButton label="New Chat" pending={sending} onClick={async () => {
              setSending(true);
              try {
                const created = await createChatSession(
                  selectedProjectId !== "all" && selectedProjectId !== "none"
                    ? { workspaceId, projectId: selectedProjectId }
                    : { workspaceId },
                );
                await loadSidebar();
                setSelectedSessionId(created.sessionId);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSending(false);
              }
            }} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a chat..." />
          </div>
          <div className="chat-v11-project-create">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New project name" />
            <input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="Project path (optional)" />
            <p className="chat-v11-muted">
              Project creation is optional. Leave the workspace on <strong>Main</strong> and click <strong>New Chat</strong> to start immediately.
            </p>
            <button type="button" onClick={async () => {
              const name = projectName.trim();
              if (!name) return;
              setSending(true);
              try {
                const created = await createChatProject({
                  workspaceId,
                  name,
                  workspacePath: projectPath.trim() || "chat/default",
                });
                setProjectName("");
                setSelectedProjectId(created.projectId);
                await loadSidebar();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSending(false);
              }
            }}>Create project</button>
          </div>
          <div className="chat-v11-filter-row">
            <button type="button" className={selectedProjectId === "all" ? "active" : ""} onClick={() => setSelectedProjectId("all")}>All projects</button>
            <button type="button" className={selectedProjectId === "none" ? "active" : ""} onClick={() => setSelectedProjectId("none")}>Unassigned</button>
          </div>
          <div className="chat-v11-session-groups">
            <h4>Mission</h4>
            <ul>
              {missionSessions.map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={selectedSessionId === session.sessionId ? "active" : ""} onClick={() => setSelectedSessionId(session.sessionId)}>
                    {session.title || session.sessionKey}
                  </button>
                  <p>{session.projectName ?? "No project yet"}</p>
                </li>
              ))}
              {missionSessions.length === 0 ? <li className="chat-v11-empty-item">No mission chats match this filter yet.</li> : null}
            </ul>
            <h4>External</h4>
            <ul>
              {externalSessions.map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={selectedSessionId === session.sessionId ? "active" : ""} onClick={() => setSelectedSessionId(session.sessionId)}>
                    {session.title || session.sessionKey}
                  </button>
                  <p>{session.channel}/{session.account}</p>
                </li>
              ))}
              {externalSessions.length === 0 ? <li className="chat-v11-empty-item">No external chats are connected right now.</li> : null}
            </ul>
          </div>
        </aside>

        <div className="chat-v11-main">
          <div className="card chat-v11-topbar">
            <ChatModeSwitch value={messageMode} disabled={!selectedSessionId || sending} onChange={(mode) => void handlePrefPatch({ mode })} />
            <ChatModelPicker
              providers={providerOptions}
              providerId={selectedProviderId}
              model={prefs?.model ?? runtimeLlmConfig?.activeModel ?? settings?.llm.activeModel}
              disabled={!selectedSessionId || sending}
              onChangeProvider={(providerId) => {
                const provider = providerOptions.find((item) => item.providerId === providerId);
                void loadModelsForProvider(providerId);
                void handlePrefPatch({ providerId, model: provider?.models[0] });
              }}
              onChangeModel={(model) => void handlePrefPatch({ model })}
            />
            <label className="chat-v11-select">Thinking
              <GCSelect
                value={prefs?.thinkingLevel ?? "standard"}
                disabled={!selectedSessionId || sending}
                onChange={(value) => void handlePrefPatch({ thinkingLevel: value as "minimal" | "standard" | "extended" })}
                options={[
                  { value: "minimal", label: "Minimal" },
                  { value: "standard", label: "Standard" },
                  { value: "extended", label: "Extended" },
                ]}
              />
            </label>
            <label className="chat-v11-select">Web
              <GCSelect
                value={prefs?.webMode ?? "auto"}
                disabled={!selectedSessionId || sending}
                onChange={(value) => void handlePrefPatch({ webMode: value as "auto" | "off" | "quick" | "deep" })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "off", label: "Off" },
                  { value: "quick", label: "Quick" },
                  { value: "deep", label: "Deep" },
                ]}
              />
            </label>
            <label className="chat-v11-select">Proactive
              <GCSelect
                value={proactiveStatus?.mode ?? prefs?.proactiveMode ?? "off"}
                disabled={!selectedSessionId || sending}
                onChange={(value) => void handleProactivePolicyPatch({ proactiveMode: value as "off" | "suggest" | "auto_safe" })}
                options={[
                  { value: "off", label: "Off" },
                  { value: "suggest", label: "Suggest" },
                  { value: "auto_safe", label: "Auto-safe" },
                ]}
              />
            </label>
            <label className="chat-v11-select">Retrieval
              <GCSelect
                value={proactiveStatus?.retrievalMode ?? prefs?.retrievalMode ?? "standard"}
                disabled={!selectedSessionId || sending}
                onChange={(value) => void handleProactivePolicyPatch({ retrievalMode: value as "standard" | "layered" })}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "layered", label: "Layered" },
                ]}
              />
            </label>
            <label className="chat-v11-select">Reflection
              <GCSelect
                value={proactiveStatus?.reflectionMode ?? prefs?.reflectionMode ?? "off"}
                disabled={!selectedSessionId || sending}
                onChange={(value) => void handleProactivePolicyPatch({ reflectionMode: value as "off" | "on" })}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" },
                ]}
              />
            </label>
            <button type="button" disabled={!selectedSessionId || sending} onClick={() => void handleSuggestDelegation()}>
              Suggest delegation
            </button>
            <button type="button" disabled={!selectedSessionId || sending} onClick={() => void handleTriggerProactive()}>
              Run proactive
            </button>
            <GCSwitch checked={streamEnabled} onCheckedChange={setStreamEnabled} label="Stream" />
          </div>

          {selectedSession ? (
            <div className="chat-v11-conversation-shell">
              <div className="chat-v11-agentic-row">
                <article className="card chat-v11-agentic-card">
                  <div className="chat-v11-agentic-head">
                    <h3>Suggestions inbox</h3>
                    <span className="token-chip">{proactiveRuns.filter((run) => run.status === "suggested").length} suggested</span>
                  </div>
                  {secondaryLoading && proactiveRuns.length === 0 && capabilitySuggestions.length === 0 && !delegationSuggestion ? (
                    <CardSkeleton lines={4} />
                  ) : null}
                  {capabilitySuggestions.length > 0 ? (
                    <div className="chat-v11-suggestion-card">
                      <p><strong>Capability upgrade available:</strong> GoatCitadel found a possible way to add what this request needs, but it still requires your approval.</p>
                      <ul className="chat-v11-proactive-list">
                        {capabilitySuggestions.slice(0, 3).map((suggestion) => (
                          <li key={`${suggestion.kind}-${suggestion.candidateId ?? suggestion.title}`}>
                            <p><strong>{suggestion.title}</strong>{suggestion.riskLevel ? ` · ${suggestion.riskLevel} risk` : ""}</p>
                            <p>{suggestion.summary}</p>
                            <p className="chat-v11-muted">{suggestion.reason}</p>
                            <div className="chat-v11-row-actions">
                              {suggestion.recommendedAction === "enable_skill" ? (
                                <button type="button" onClick={() => void handleCapabilitySuggestionAction(suggestion)}>Enable skill</button>
                              ) : null}
                              {suggestion.recommendedAction === "install_skill_disabled" ? (
                                <button type="button" onClick={() => void handleCapabilitySuggestionAction(suggestion)}>Install disabled</button>
                              ) : null}
                              {suggestion.recommendedAction === "add_mcp_template" ? (
                                <button type="button" onClick={() => void handleCapabilitySuggestionAction(suggestion)}>Add MCP template</button>
                              ) : null}
                              {suggestion.recommendedAction === "switch_tool_profile" ? (
                                <button type="button" onClick={() => void handleCapabilitySuggestionAction(suggestion)}>Review tool profile</button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  window.location.hash = suggestion.kind === "mcp_template" ? "mcp" : "skills";
                                }}
                              >
                                {suggestion.kind === "mcp_template" ? "Open MCP" : "Open Skills"}
                              </button>
                              <button type="button" onClick={() => dismissCapabilitySuggestion(suggestion)}>Dismiss</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {delegationSuggestion ? (
                    <div className="chat-v11-suggestion-card">
                      <p><strong>Delegation suggestion:</strong> {delegationSuggestion.reason}</p>
                      <p>Roles: {delegationSuggestion.roles.join(" -> ")}</p>
                      <div className="chat-v11-row-actions">
                        <button type="button" disabled={sending} onClick={() => void handleAcceptDelegation()}>Accept plan</button>
                        <button type="button" disabled={sending} onClick={() => setDelegationSuggestion(null)}>Dismiss</button>
                      </div>
                    </div>
                  ) : (
                    <p className="chat-v11-muted">No pending delegation suggestion. Click “Suggest delegation” to generate one from your current request.</p>
                  )}
                  <ul className="chat-v11-proactive-list">
                    {proactiveRuns.slice(0, 4).map((run) => (
                      <li key={run.runId}>
                        <p><strong>{run.status}</strong> · {new Date(run.startedAt).toLocaleTimeString()}</p>
                        <p>{run.reasoningSummary}</p>
                      </li>
                    ))}
                    {proactiveRuns.length === 0 ? <li className="chat-v11-muted">No proactive runs yet for this session.</li> : null}
                  </ul>
                </article>

                <article className="card chat-v11-agentic-card">
                  <div className="chat-v11-agentic-head">
                    <h3>Learned memory <HelpHint label="Learned memory help" text="Learned memory stores facts, goals, preferences, and constraints GoatCitadel may reuse in future turns for this session." /></h3>
                    <button type="button" disabled={sending || !selectedSessionId} onClick={() => void handleRebuildLearnedMemory()}>
                      Rebuild
                    </button>
                  </div>
                  <p className="chat-v11-muted">Review what GoatCitadel is carrying forward (preferences, goals, constraints, facts, project context).</p>
                  {secondaryLoading && learnedMemory.length === 0 ? <CardSkeleton lines={5} /> : null}
                  <ul className="chat-v11-memory-list">
                    {learnedMemory.slice(0, 6).map((item) => (
                      <li key={item.itemId}>
                        <p>
                          <strong>{item.itemType}</strong>
                          {" · "}
                          Confidence {Math.round(item.confidence * 100)}%
                          <HelpHint label="Memory confidence help" text="Confidence is GoatCitadel's estimate of how reliable this memory is for future replies. It is not a completion score; higher means the system is more willing to reuse it." />
                          {" · "}
                          {item.status}
                          <HelpHint label="Memory status help" text={
                            item.status === "active"
                              ? "Active memory is currently eligible to influence future turns."
                              : item.status === "superseded"
                                ? "Superseded memory was replaced by a newer or more accurate item."
                                : item.status === "disabled"
                                  ? "Disabled memory stays in history but no longer influences future turns."
                                  : "Conflict means the memory needs review before it should influence future turns."
                          } />
                        </p>
                        <p>{item.content}</p>
                        <div className="chat-v11-row-actions">
                          <button type="button" title="Keep this memory active so it continues influencing future turns." disabled={sending} onClick={() => void handleMemoryStatusUpdate(item.itemId, "active")}>Keep</button>
                          <button type="button" title="Mark this memory as replaced by a newer or better one." disabled={sending} onClick={() => void handleMemoryStatusUpdate(item.itemId, "superseded")}>Supersede</button>
                          <button type="button" title="Stop using this memory without deleting its history." disabled={sending} onClick={() => void handleMemoryStatusUpdate(item.itemId, "disabled")}>Disable</button>
                        </div>
                      </li>
                    ))}
                    {learnedMemory.length === 0 ? <li className="chat-v11-muted">No learned memory items yet. They appear after completed assistant turns.</li> : null}
                  </ul>
                </article>
              </div>

              <div className="card chat-v11-session-bar">
                <input value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} placeholder="Session title" />
                <ActionButton label="Save" pending={sending} onClick={async () => {
                  if (!selectedSession) return;
                  setSending(true);
                  try {
                    await updateChatSession(selectedSession.sessionId, { title: renameTitle.trim() || undefined });
                    await loadSidebar();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setSending(false);
                  }
                }} />
                <ActionButton label={selectedSession.pinned ? "Unpin" : "Pin"} pending={sending} onClick={async () => {
                  if (!selectedSession) return;
                  setSending(true);
                  try {
                    if (selectedSession.pinned) await unpinChatSession(selectedSession.sessionId); else await pinChatSession(selectedSession.sessionId);
                    await loadSidebar();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setSending(false);
                  }
                }} />
                <ActionButton label={selectedSession.lifecycleStatus === "archived" ? "Restore" : "Archive"} pending={sending} onClick={async () => {
                  if (!selectedSession) return;
                  setSending(true);
                  try {
                    if (selectedSession.lifecycleStatus === "archived") await restoreChatSession(selectedSession.sessionId); else await archiveChatSession(selectedSession.sessionId);
                    await loadSidebar();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setSending(false);
                  }
                }} />
                <GCCombobox
                  value={selectedSessionProjectValue}
                  onChange={(value) => {
                    void assignChatSessionProject(
                      selectedSession.sessionId,
                      value === "none" ? undefined : value,
                    ).then(loadSidebar).catch((err) => setError((err as Error).message));
                  }}
                  placeholder="Pick project"
                  options={[
                    { value: "none", label: "Unassigned" },
                    ...(projects?.items ?? [])
                      .filter((item) => item.lifecycleStatus === "active")
                      .map((project) => ({ value: project.projectId, label: project.name })),
                  ]}
                />
              </div>

              {selectedSession.scope === "external" && (!binding || !binding.writable) ? <div className="status-banner warning">This external chat is read-only right now. Set a connection and target before sending replies out.</div> : null}
              {selectedSession.scope === "external" ? (
                <div className="card chat-v11-external-bind">
                  <input value={integrationConnectionId} onChange={(event) => setIntegrationConnectionId(event.target.value)} placeholder="Connection ID (example: slack:workspace-a)" />
                  <input value={integrationTarget} onChange={(event) => setIntegrationTarget(event.target.value)} placeholder="Target (example: #ops-room or thread id)" />
                  <ActionButton label="Save binding" pending={sending} onClick={async () => {
                    if (!selectedSession) return;
                    setSending(true);
                    try {
                      const next = await setChatSessionBinding(selectedSession.sessionId, { transport: "integration", connectionId: integrationConnectionId.trim(), target: integrationTarget.trim(), writable: true });
                      setBinding(next);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setSending(false);
                    }
                  }} />
                </div>
              ) : null}

              <div className={`chat-v11-main-grid ${messageMode === "cowork" ? "with-cowork" : ""}`}>
                <article className={`card chat-v11-thread mode-${messageMode}`}>
                  {messagesLoading ? <CardSkeleton lines={8} /> : (
                    <ul
                      ref={messageListRef}
                      className="chat-v11-messages"
                      onScroll={handleMessageListScroll}
                    >
                      {messages.map((message) => (
                        <li key={message.messageId} className={`chat-v11-message ${message.role}`}>
                          <p className="chat-v11-message-meta"><strong>{formatMessageActor(message.role)}</strong> · {new Date(message.timestamp).toLocaleTimeString()}</p>
                          <p>{message.content}</p>
                          {message.attachments && message.attachments.length > 0 ? <div className="chat-v11-attachment-row">{message.attachments.map((attachment) => <span key={attachment.attachmentId} className="token-chip">{attachment.fileName}</span>)}</div> : null}
                        </li>
                      ))}
                      {messages.length === 0 ? (
                        <li className="chat-v11-message system chat-v11-empty-thread">
                          <p className="chat-v11-message-meta"><strong>GoatCitadel</strong></p>
                          <p>Start with a plain request, or type <code>/help</code> to see commands.</p>
                        </li>
                      ) : null}
                    </ul>
                  )}

                  {pendingApproval ? <InlineApprovalPrompt approvalId={pendingApproval.approvalId} toolName={pendingApproval.toolName} reason={pendingApproval.reason} pending={approvalPending} onApprove={() => void handleApprovePending()} onDeny={() => void handleDenyPending()} /> : null}
                  {latestTrace ? <ChatTraceCard trace={latestTrace} /> : null}

                  <div className={`chat-v11-composer ${isDragActive ? "drop-active" : ""}`} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                    {isDragActive ? <div className="chat-drop-overlay">Drop files to attach</div> : null}
                    <textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} onPaste={handleComposerPaste} placeholder="Ask GoatCitadel anything... Try /help" rows={4} />
                    {commandSuggestions.length > 0 ? (
                      <div className="chat-v11-command-popover" role="listbox" aria-label="Slash command suggestions">
                        {commandSuggestions.map((item, index) => (
                          <button key={item.command} type="button" className={index === commandIndex ? "active" : ""} onClick={() => applyDraftCommand(item.command)}>
                            <strong>{item.command}</strong>
                            <span>{item.description}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {pendingAttachments.length > 0 ? (
                      <div className="chat-v11-pending-attachments">
                        {pendingAttachments.map((item) => (
                          <button key={item.attachmentId} type="button" className="chat-attachment-chip" onClick={() => setPendingAttachments((current) => current.filter((entry) => entry.attachmentId !== item.attachmentId))}>{item.fileName} ×</button>
                        ))}
                      </div>
                    ) : null}
                    <div className="chat-v11-composer-actions">
                      <ChatComposerPlusMenu disabled={sending} onAttachFiles={() => fileInputRef.current?.click()} onRunQuickResearch={() => { void handleRunQuickResearch(); }} />
                      <input ref={fileInputRef} type="file" multiple className="chat-v11-hidden-file" onChange={(event) => {
                        const files = event.target.files;
                        if (!files || files.length === 0) return;
                        void uploadAttachments(Array.from(files));
                      }} />
                      <p>Tip: drag files here, paste screenshots, and press Enter to send.</p>
                      <button type="button" disabled={!canSend} onClick={() => void handleSend()}>{sending ? "Sending..." : "Send message"}</button>
                    </div>
                  </div>
                </article>
                {messageMode === "cowork" ? <CoworkCanvasPanel items={coworkItems} /> : null}
              </div>
            </div>
          ) : (
            <article className="card chat-v11-empty-shell">
              <h3>No chat selected</h3>
              <p className="office-subtitle">Pick a chat from the left, or click New Chat to start one. You do not need to create a project first.</p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function formatCommandResult(result: { ok: boolean; message: string; research?: { sources: Array<{ url: string }> } }): string {
  const status = result.ok ? "Command completed" : "Command failed";
  if (!result.research) return `${status}: ${result.message}`;
  return `${status}: ${result.message}\nSources: ${result.research.sources.length}`;
}

function formatMessageActor(role: ChatMessageRecord["role"]): string {
  if (role === "assistant") return "GoatCitadel";
  if (role === "user") return "You";
  return "System";
}

function deriveCoworkItems(messages: ChatMessageRecord[]): Array<{ id: string; title: string; note?: string }> {
  const latestAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  const latestUser = [...messages].reverse().find((item) => item.role === "user");
  const items: Array<{ id: string; title: string; note?: string }> = [];
  if (latestAssistant) {
    const lines = latestAssistant.content.split(/\r?\n/g).map((line) => line.trim()).filter((line) => line.length > 0).slice(0, 4);
    lines.forEach((line, index) => items.push({ id: `assistant-${index}`, title: line.slice(0, 88) }));
  }
  if (items.length < 3 && latestUser) {
    items.push({ id: "user-goal", title: "Current operator request", note: latestUser.content.slice(0, 180) });
  }
  return items.slice(0, 5);
}
