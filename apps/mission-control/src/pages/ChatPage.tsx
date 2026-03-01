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
  ChatMessageRecord,
  ChatSessionBindingRecord,
  ChatSessionPrefsRecord,
  ChatSessionRecord,
  ChatTurnTraceRecord,
} from "@goatcitadel/contracts";
import {
  approveChatTool,
  archiveChatSession,
  assignChatSessionProject,
  createChatProject,
  createChatSession,
  denyChatTool,
  fetchChatCommandCatalog,
  fetchChatMessages,
  fetchChatProjects,
  fetchChatSessionBinding,
  fetchChatSessionPrefs,
  fetchChatSessions,
  fetchSettings,
  parseChatCommand,
  pinChatSession,
  restoreChatSession,
  runChatResearch,
  sendAgentChatMessage,
  setChatSessionBinding,
  streamAgentChatMessage,
  unpinChatSession,
  updateChatSession,
  updateChatSessionPrefs,
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

export function ChatPage({ refreshKey = 0 }: { refreshKey?: number }) {
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
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalState | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
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

  const loadSidebar = useCallback(async () => {
    const [nextProjects, nextSessions] = await Promise.all([
      fetchChatProjects("all", 500),
      fetchChatSessions({ scope: "all", view: "all", limit: 500 }),
    ]);
    setProjects(nextProjects);
    setSessions(nextSessions);
    setSelectedSessionId((current) => current ?? nextSessions.items[0]?.sessionId ?? null);
  }, []);

  const loadRuntimeCatalog = useCallback(async () => {
    const [runtimeSettings, commands] = await Promise.all([fetchSettings(), fetchChatCommandCatalog()]);
    setSettings(runtimeSettings);
    setCommandCatalog(commands.items);
  }, []);

  const loadSessionState = useCallback(async (sessionId: string) => {
    setMessagesLoading(true);
    try {
      const [nextMessages, nextBinding, nextPrefs] = await Promise.all([
        fetchChatMessages(sessionId, 500),
        fetchChatSessionBinding(sessionId),
        fetchChatSessionPrefs(sessionId),
      ]);
      setMessages(nextMessages.items);
      setBinding(nextBinding.item);
      setPrefs(nextPrefs);
      setLatestTrace(null);
      setPendingApproval(null);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!initializedRef.current) return;
    const timer = window.setTimeout(() => {
      void loadSidebar().catch((err: Error) => setError(err.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadSidebar, refreshKey]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      setPrefs(null);
      setBinding(null);
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
    void loadSessionState(selectedSessionId).catch((err: Error) => setError(err.message));
  }, [loadSessionState, selectedSessionId]);

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

  const providerOptions = useMemo<ChatModelProviderOption[]>(() => {
    const providers = settings?.llm.providers ?? [];
    return providers.map((provider) => ({
      providerId: provider.providerId,
      label: provider.label,
      models: dedupeStrings([
        provider.defaultModel,
        provider.providerId === settings?.llm.activeProviderId ? settings?.llm.activeModel : undefined,
        prefs?.providerId === provider.providerId ? prefs.model : undefined,
      ]),
    }));
  }, [prefs?.model, prefs?.providerId, settings?.llm.activeModel, settings?.llm.activeProviderId, settings?.llm.providers]);

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
      selectedProjectId !== "all" && selectedProjectId !== "none" ? { projectId: selectedProjectId } : undefined,
    );
    await loadSidebar();
    setSelectedSessionId(created.sessionId);
    return created;
  }, [loadSidebar, selectedProjectId, selectedSession]);

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
      setMessages((current) => [...current, synthetic]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [draft, ensureSession, messages, prefs?.model, prefs?.providerId, prefs?.webMode, sending]);

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
    setMessages((current) => [...current, echo]);
    if (result.command === "/project") await loadSidebar();
  }, [loadSidebar]);

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
      setMessages((current) => [...current, {
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
        setMessages((current) => [...current, {
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
            setMessages((current) => current.map((item) => item.messageId === placeholderId
              ? { ...item, content: `${item.content}${chunk.delta}` }
              : item));
            return;
          }
          if (chunk.type === "message_done") {
            setMessages((current) => current.map((item) => item.messageId === placeholderId
              ? { ...item, content: chunk.content || item.content }
              : item));
            return;
          }
          if (chunk.type === "trace_update" && chunk.trace) {
            setLatestTrace(chunk.trace);
            return;
          }
          if (chunk.type === "approval_required" && chunk.approval?.approvalId) {
            setPendingApproval({ approvalId: chunk.approval.approvalId, toolName: chunk.approval.toolName, reason: chunk.approval.reason });
            return;
          }
          if (chunk.type === "error") setError(chunk.error || "Streaming request failed.");
        });
        committed = true;
      } else {
        const sent = await sendAgentChatMessage(session.sessionId, payload);
        committed = true;
        setMessages((current) => current.map((item) => item.messageId === localUserId ? sent.userMessage : item));
        if (sent.assistantMessage) setMessages((current) => [...current, sent.assistantMessage as ChatMessageRecord]);
        if (sent.trace) setLatestTrace(sent.trace);
      }

      await loadSidebar();
    } catch (err) {
      if (placeholderId) setMessages((current) => current.filter((item) => item.messageId !== placeholderId));
      if (!committed) {
        if (localUserId) setMessages((current) => current.filter((item) => item.messageId !== localUserId));
        setDraft((current) => (current.trim().length > 0 ? current : content));
        setPendingAttachments((current) => (current.length > 0 ? current : attachmentsSnapshot));
      }
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [draft, ensureSession, handleCommandExecution, loadSessionState, loadSidebar, pendingAttachments, prefs?.memoryMode, prefs?.mode, prefs?.model, prefs?.providerId, prefs?.thinkingLevel, prefs?.webMode, sending, streamEnabled]);

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
      setMessages((current) => [...current, {
        messageId: `approval-ok-${Date.now()}`,
        sessionId: selectedSession.sessionId,
        role: "system",
        actorType: "system",
        actorId: "approval",
        content: `Approved ${pendingApproval.approvalId}. Re-send your message to continue.`,
        timestamp: new Date().toISOString(),
      }]);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovalPending(false);
    }
  }, [pendingApproval, selectedSession]);

  const handleDenyPending = useCallback(async () => {
    if (!selectedSession || !pendingApproval) return;
    setApprovalPending(true);
    try {
      await denyChatTool(selectedSession.sessionId, pendingApproval.approvalId);
      setMessages((current) => [...current, {
        messageId: `approval-deny-${Date.now()}`,
        sessionId: selectedSession.sessionId,
        role: "system",
        actorType: "system",
        actorId: "approval",
        content: `Denied ${pendingApproval.approvalId}.`,
        timestamp: new Date().toISOString(),
      }]);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovalPending(false);
    }
  }, [pendingApproval, selectedSession]);

  const handlePrefPatch = useCallback(async (patch: Partial<Omit<ChatSessionPrefsRecord, "sessionId" | "createdAt" | "updatedAt">>) => {
    if (!selectedSession) return;
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
          text="Use slash commands for control, select mode/model in the top bar, and keep trace cards collapsed until needed."
        />
      </header>
      {error ? <p className="error">{error}</p> : null}

      <div className="chat-v11-shell">
        <aside className="card chat-v11-left">
          <div className="chat-v11-left-head">
            <ActionButton label="New Chat" pending={sending} onClick={async () => {
              setSending(true);
              try {
                const created = await createChatSession(selectedProjectId !== "all" && selectedProjectId !== "none" ? { projectId: selectedProjectId } : undefined);
                await loadSidebar();
                setSelectedSessionId(created.sessionId);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSending(false);
              }
            }} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" />
          </div>
          <div className="chat-v11-project-create">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New project" />
            <input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="project path" />
            <button type="button" onClick={async () => {
              const name = projectName.trim();
              if (!name) return;
              setSending(true);
              try {
                const created = await createChatProject({ name, workspacePath: projectPath.trim() || "chat/default" });
                setProjectName("");
                setSelectedProjectId(created.projectId);
                await loadSidebar();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSending(false);
              }
            }}>Create Project</button>
          </div>
          <div className="chat-v11-filter-row">
            <button type="button" className={selectedProjectId === "all" ? "active" : ""} onClick={() => setSelectedProjectId("all")}>All projects</button>
            <button type="button" className={selectedProjectId === "none" ? "active" : ""} onClick={() => setSelectedProjectId("none")}>Unassigned</button>
          </div>
          <div className="chat-v11-session-groups">
            <h4>Mission</h4>
            <ul>
              {visibleSessions.filter((item) => item.scope === "mission").map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={selectedSessionId === session.sessionId ? "active" : ""} onClick={() => setSelectedSessionId(session.sessionId)}>
                    {session.title || session.sessionKey}
                  </button>
                  <p>{session.projectName ?? "No project"}</p>
                </li>
              ))}
            </ul>
            <h4>External</h4>
            <ul>
              {visibleSessions.filter((item) => item.scope === "external").map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={selectedSessionId === session.sessionId ? "active" : ""} onClick={() => setSelectedSessionId(session.sessionId)}>
                    {session.title || session.sessionKey}
                  </button>
                  <p>{session.channel}/{session.account}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="chat-v11-main">
          <div className="card chat-v11-topbar">
            <ChatModeSwitch value={messageMode} disabled={!selectedSessionId || sending} onChange={(mode) => void handlePrefPatch({ mode })} />
            <ChatModelPicker
              providers={providerOptions}
              providerId={prefs?.providerId ?? settings?.llm.activeProviderId}
              model={prefs?.model ?? settings?.llm.activeModel}
              disabled={!selectedSessionId || sending}
              onChangeProvider={(providerId) => {
                const provider = providerOptions.find((item) => item.providerId === providerId);
                void handlePrefPatch({ providerId, model: provider?.models[0] });
              }}
              onChangeModel={(model) => void handlePrefPatch({ model })}
            />
            <label className="chat-v11-select">Thinking
              <select value={prefs?.thinkingLevel ?? "standard"} disabled={!selectedSessionId || sending} onChange={(event) => void handlePrefPatch({ thinkingLevel: event.target.value as "minimal" | "standard" | "extended" })}>
                <option value="minimal">Minimal</option>
                <option value="standard">Standard</option>
                <option value="extended">Extended</option>
              </select>
            </label>
            <label className="chat-v11-select">Web
              <select value={prefs?.webMode ?? "auto"} disabled={!selectedSessionId || sending} onChange={(event) => void handlePrefPatch({ webMode: event.target.value as "auto" | "off" | "quick" | "deep" })}>
                <option value="auto">Auto</option>
                <option value="off">Off</option>
                <option value="quick">Quick</option>
                <option value="deep">Deep</option>
              </select>
            </label>
            <label className="chat-v11-toggle"><input type="checkbox" checked={streamEnabled} onChange={(event) => setStreamEnabled(event.target.checked)} />Stream</label>
          </div>

          {selectedSession ? (
            <div className="chat-v11-conversation-shell">
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
                <select value={selectedSessionProjectValue} onChange={(event) => void assignChatSessionProject(selectedSession.sessionId, event.target.value === "none" ? undefined : event.target.value).then(loadSidebar).catch((err) => setError((err as Error).message))}>
                  <option value="none">Unassigned</option>
                  {(projects?.items ?? []).filter((item) => item.lifecycleStatus === "active").map((project) => (
                    <option key={project.projectId} value={project.projectId}>{project.name}</option>
                  ))}
                </select>
              </div>

              {selectedSession.scope === "external" && (!binding || !binding.writable) ? <div className="status-banner warning">External writeback is not configured. Set connection + target first.</div> : null}
              {selectedSession.scope === "external" ? (
                <div className="card chat-v11-external-bind">
                  <input value={integrationConnectionId} onChange={(event) => setIntegrationConnectionId(event.target.value)} placeholder="connection id" />
                  <input value={integrationTarget} onChange={(event) => setIntegrationTarget(event.target.value)} placeholder="target (channel/thread/email)" />
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
                          <p className="chat-v11-message-meta"><strong>{message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "You"}</strong> · {new Date(message.timestamp).toLocaleTimeString()}</p>
                          <p>{message.content}</p>
                          {message.attachments && message.attachments.length > 0 ? <div className="chat-v11-attachment-row">{message.attachments.map((attachment) => <span key={attachment.attachmentId} className="token-chip">{attachment.fileName}</span>)}</div> : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {pendingApproval ? <InlineApprovalPrompt approvalId={pendingApproval.approvalId} toolName={pendingApproval.toolName} reason={pendingApproval.reason} pending={approvalPending} onApprove={() => void handleApprovePending()} onDeny={() => void handleDenyPending()} /> : null}
                  {latestTrace ? <ChatTraceCard trace={latestTrace} /> : null}

                  <div className={`chat-v11-composer ${isDragActive ? "drop-active" : ""}`} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                    {isDragActive ? <div className="chat-drop-overlay">Drop files to attach</div> : null}
                    <textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} onPaste={handleComposerPaste} placeholder="Message GoatCitadel... Try /help" rows={4} />
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
                      <p>Drag files or paste screenshots to attach.</p>
                      <button type="button" disabled={!canSend} onClick={() => void handleSend()}>{sending ? "Sending..." : "Send"}</button>
                    </div>
                  </div>
                </article>
                {messageMode === "cowork" ? <CoworkCanvasPanel items={coworkItems} /> : null}
              </div>
            </div>
          ) : (
            <article className="card"><p className="office-subtitle">Create or pick a session to start chatting.</p></article>
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
