import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveChatProject,
  archiveChatSession,
  assignChatSessionProject,
  createChatProject,
  createChatSession,
  fetchChatMessages,
  fetchChatProjects,
  fetchChatSessionBinding,
  fetchChatSessions,
  hardDeleteChatProject,
  pinChatSession,
  restoreChatProject,
  restoreChatSession,
  sendChatMessage,
  setChatSessionBinding,
  streamChatMessage,
  unpinChatSession,
  updateChatSession,
  uploadChatAttachment,
  type ChatMessagesResponse,
  type ChatProjectsResponse,
  type ChatSessionsResponse,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { CardSkeleton } from "../components/CardSkeleton";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";
import type { ChatAttachmentRecord, ChatMessageRecord, ChatSessionBindingRecord, ChatSessionRecord } from "@goatcitadel/contracts";

const STREAM_PREF_KEY = "goatcitadel.chat.stream.enabled";

export function ChatPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [projects, setProjects] = useState<ChatProjectsResponse | null>(null);
  const [sessions, setSessions] = useState<ChatSessionsResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessagesResponse["items"]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachmentRecord[]>([]);
  const [binding, setBinding] = useState<ChatSessionBindingRecord | null>(null);
  const [streamEnabled, setStreamEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const raw = window.localStorage.getItem(STREAM_PREF_KEY);
    return raw === null ? true : raw === "true";
  });
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("chat/default");
  const [renameTitle, setRenameTitle] = useState("");
  const [integrationConnectionId, setIntegrationConnectionId] = useState("");
  const [integrationTarget, setIntegrationTarget] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSidebar = useCallback(async () => {
    const [nextProjects, nextSessions] = await Promise.all([
      fetchChatProjects("all", 500),
      fetchChatSessions({
        scope: "all",
        view: "all",
        limit: 500,
      }),
    ]);
    setProjects(nextProjects);
    setSessions(nextSessions);
    setSelectedSessionId((current) => current ?? nextSessions.items[0]?.sessionId ?? null);
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    setMessagesLoading(true);
    try {
      const [nextMessages, bindingRes] = await Promise.all([
        fetchChatMessages(sessionId, 500),
        fetchChatSessionBinding(sessionId),
      ]);
      setMessages(nextMessages.items);
      setBinding(bindingRes.item);
      setPendingAttachments([]);
      const selected = sessions?.items.find((item) => item.sessionId === sessionId);
      setRenameTitle(selected?.title ?? "");
    } finally {
      setMessagesLoading(false);
    }
  }, [sessions?.items]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadSidebar()
      .then(() => {
        if (!cancelled) {
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadSidebar, refreshKey]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      setBinding(null);
      return;
    }
    void loadMessages(selectedSessionId).catch((err: Error) => {
      setError(err.message);
    });
  }, [selectedSessionId, loadMessages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STREAM_PREF_KEY, String(streamEnabled));
  }, [streamEnabled]);

  const visibleSessions = useMemo(() => {
    const all = sessions?.items ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((item) => {
      if (selectedProjectId !== "all") {
        if (selectedProjectId === "none") {
          if (item.projectId) {
            return false;
          }
        } else if (item.projectId !== selectedProjectId) {
          return false;
        }
      }
      if (!q) {
        return true;
      }
      const haystack = [item.title, item.sessionKey, item.projectName, item.channel, item.account].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [search, selectedProjectId, sessions?.items]);

  const missionSessions = visibleSessions.filter((item) => item.scope === "mission");
  const externalSessions = visibleSessions.filter((item) => item.scope === "external");
  const selectedSession = sessions?.items.find((item) => item.sessionId === selectedSessionId) ?? null;

  const ensureSession = useCallback(async (): Promise<ChatSessionRecord> => {
    if (selectedSession) {
      return selectedSession;
    }
    const created = await createChatSession(
      selectedProjectId !== "all" && selectedProjectId !== "none" ? { projectId: selectedProjectId } : undefined,
    );
    await loadSidebar();
    setSelectedSessionId(created.sessionId);
    return created;
  }, [loadSidebar, selectedProjectId, selectedSession]);

  const handleCreateProject = useCallback(async () => {
    const name = projectName.trim();
    if (!name) {
      return;
    }
    setSending(true);
    try {
      const created = await createChatProject({
        name,
        workspacePath: projectPath.trim() || "chat/default",
      });
      setProjectName("");
      setSelectedProjectId(created.projectId);
      await loadSidebar();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [loadSidebar, projectName, projectPath]);

  const handleCreateSession = useCallback(async () => {
    setSending(true);
    try {
      const created = await createChatSession(
        selectedProjectId !== "all" && selectedProjectId !== "none" ? { projectId: selectedProjectId } : undefined,
      );
      await loadSidebar();
      setSelectedSessionId(created.sessionId);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [loadSidebar, selectedProjectId]);

  const handleAttachFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setSending(true);
    try {
      const session = await ensureSession();
      const uploaded: ChatAttachmentRecord[] = [];
      for (const file of Array.from(files)) {
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [ensureSession]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) {
      return;
    }
    setSending(true);
    try {
      const session = await ensureSession();
      const attachmentIds = pendingAttachments.map((item) => item.attachmentId);
      if (streamEnabled) {
        const placeholderId = `stream-${Date.now()}`;
        setMessages((current) => [
          ...current,
          {
            messageId: placeholderId,
            sessionId: session.sessionId,
            role: "assistant",
            actorType: "agent",
            actorId: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
          },
        ]);
        await streamChatMessage(
          session.sessionId,
          {
            content,
            useMemory: true,
            attachments: attachmentIds,
          },
          (chunk) => {
            if (chunk.type === "delta" && chunk.delta) {
              setMessages((current) => current.map((item) => item.messageId === placeholderId
                ? { ...item, content: `${item.content}${chunk.delta}` }
                : item));
            }
          },
        );
      } else {
        await sendChatMessage(session.sessionId, {
          content,
          useMemory: true,
          attachments: attachmentIds,
        });
      }
      setDraft("");
      setPendingAttachments([]);
      await Promise.all([loadSidebar(), loadMessages(session.sessionId)]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [draft, ensureSession, loadMessages, loadSidebar, pendingAttachments, sending, streamEnabled]);

  const handleRenameSession = useCallback(async () => {
    if (!selectedSession) {
      return;
    }
    setSending(true);
    try {
      await updateChatSession(selectedSession.sessionId, { title: renameTitle.trim() || undefined });
      await loadSidebar();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [loadSidebar, renameTitle, selectedSession]);

  const handleTogglePin = useCallback(async () => {
    if (!selectedSession) {
      return;
    }
    setSending(true);
    try {
      if (selectedSession.pinned) {
        await unpinChatSession(selectedSession.sessionId);
      } else {
        await pinChatSession(selectedSession.sessionId);
      }
      await loadSidebar();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [loadSidebar, selectedSession]);

  const handleArchiveRestoreSession = useCallback(async () => {
    if (!selectedSession) {
      return;
    }
    setSending(true);
    try {
      if (selectedSession.lifecycleStatus === "archived") {
        await restoreChatSession(selectedSession.sessionId);
      } else {
        await archiveChatSession(selectedSession.sessionId);
      }
      await loadSidebar();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [loadSidebar, selectedSession]);

  const handleBindingSave = useCallback(async () => {
    if (!selectedSession) {
      return;
    }
    setSending(true);
    try {
      const nextBinding = await setChatSessionBinding(selectedSession.sessionId, {
        transport: "integration",
        connectionId: integrationConnectionId.trim(),
        target: integrationTarget.trim(),
        writable: true,
      });
      setBinding(nextBinding);
      await loadSidebar();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }, [integrationConnectionId, integrationTarget, loadSidebar, selectedSession]);

  const selectedSessionProjectValue = selectedSession?.projectId ?? "none";

  if (loading) {
    return (
      <section>
        <h2>{pageCopy.chat.title}</h2>
        <CardSkeleton lines={8} />
      </section>
    );
  }

  return (
    <section>
      <h2>{pageCopy.chat.title}</h2>
      <p className="office-subtitle">{pageCopy.chat.subtitle}</p>
      <PageGuideCard
        what={pageCopy.chat.guide?.what ?? ""}
        when={pageCopy.chat.guide?.when ?? ""}
        actions={pageCopy.chat.guide?.actions ?? []}
        terms={pageCopy.chat.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}

      <div className="chat-layout">
        <aside className="card chat-pane">
          <h3>Projects</h3>
          <div className="controls-row">
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="New project name"
            />
            <input
              value={projectPath}
              onChange={(event) => setProjectPath(event.target.value)}
              placeholder="workspace path"
            />
            <ActionButton label="Create" pending={sending} onClick={handleCreateProject} />
          </div>
          <ul className="compact-list chat-scroll">
            <li>
              <button
                type="button"
                className={selectedProjectId === "all" ? "active" : ""}
                onClick={() => setSelectedProjectId("all")}
              >
                All projects
              </button>
            </li>
            <li>
              <button
                type="button"
                className={selectedProjectId === "none" ? "active" : ""}
                onClick={() => setSelectedProjectId("none")}
              >
                Unassigned
              </button>
            </li>
            {(projects?.items ?? []).map((project) => (
              <li key={project.projectId}>
                <button
                  type="button"
                  className={selectedProjectId === project.projectId ? "active" : ""}
                  onClick={() => setSelectedProjectId(project.projectId)}
                >
                  {project.name}
                </button>
                <p className="office-subtitle">{project.workspacePath}</p>
                <div className="actions">
                  {project.lifecycleStatus === "archived" ? (
                    <button
                      type="button"
                      onClick={() => void (async () => {
                        try {
                          await restoreChatProject(project.projectId);
                          await loadSidebar();
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      })()}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void (async () => {
                        try {
                          await archiveChatProject(project.projectId);
                          await loadSidebar();
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      })()}
                    >
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void (async () => {
                      try {
                        await hardDeleteChatProject(project.projectId);
                        await loadSidebar();
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    })()}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <aside className="card chat-pane">
          <h3>Sessions</h3>
          <div className="controls-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sessions"
            />
            <ActionButton label="New Chat" pending={sending} onClick={handleCreateSession} />
          </div>
          <h4>Mission</h4>
          <ul className="compact-list chat-scroll">
            {missionSessions.map((session) => (
              <li key={session.sessionId}>
                <button
                  type="button"
                  className={selectedSessionId === session.sessionId ? "active" : ""}
                  onClick={() => setSelectedSessionId(session.sessionId)}
                >
                  {session.title || session.sessionKey}
                </button>
                <p className="office-subtitle">
                  {session.projectName ?? "No project"} | {new Date(session.updatedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
          <h4>External</h4>
          <ul className="compact-list chat-scroll">
            {externalSessions.map((session) => (
              <li key={session.sessionId}>
                <button
                  type="button"
                  className={selectedSessionId === session.sessionId ? "active" : ""}
                  onClick={() => setSelectedSessionId(session.sessionId)}
                >
                  {session.title || session.sessionKey}
                </button>
                <p className="office-subtitle">
                  {session.channel}/{session.account}
                </p>
              </li>
            ))}
          </ul>
        </aside>

        <article className="card chat-pane chat-thread">
          <h3>Conversation</h3>
          {!selectedSession ? (
            <p className="office-subtitle">Pick a session or create a new chat.</p>
          ) : (
            <>
              <div className="controls-row">
                <input
                  value={renameTitle}
                  onChange={(event) => setRenameTitle(event.target.value)}
                  placeholder="Session title"
                />
                <ActionButton label="Save Title" pending={sending} onClick={handleRenameSession} />
                <ActionButton label={selectedSession.pinned ? "Unpin" : "Pin"} pending={sending} onClick={handleTogglePin} />
                <ActionButton
                  label={selectedSession.lifecycleStatus === "archived" ? "Restore" : "Archive"}
                  pending={sending}
                  onClick={handleArchiveRestoreSession}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="chatProjectSelect">Project</label>
                <select
                  id="chatProjectSelect"
                  value={selectedSessionProjectValue}
                  onChange={(event) => void (async () => {
                    try {
                      await assignChatSessionProject(
                        selectedSession.sessionId,
                        event.target.value === "none" ? undefined : event.target.value,
                      );
                      await loadSidebar();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  })()}
                >
                  <option value="none">Unassigned</option>
                  {(projects?.items ?? [])
                    .filter((item) => item.lifecycleStatus === "active")
                    .map((project) => (
                      <option key={project.projectId} value={project.projectId}>{project.name}</option>
                    ))}
                </select>
                <label htmlFor="streamMode">
                  <input
                    id="streamMode"
                    type="checkbox"
                    checked={streamEnabled}
                    onChange={(event) => setStreamEnabled(event.target.checked)}
                  />
                  Stream response
                </label>
              </div>

              {selectedSession.scope === "external" && (!binding || !binding.writable) ? (
                <div className="status-banner warning">
                  External session writeback is not configured. Set integration binding to send messages.
                </div>
              ) : null}

              {selectedSession.scope === "external" ? (
                <div className="controls-row">
                  <input
                    value={integrationConnectionId}
                    onChange={(event) => setIntegrationConnectionId(event.target.value)}
                    placeholder="connection id"
                  />
                  <input
                    value={integrationTarget}
                    onChange={(event) => setIntegrationTarget(event.target.value)}
                    placeholder="target (channel/thread/email)"
                  />
                  <ActionButton label="Save Binding" pending={sending} onClick={handleBindingSave} />
                </div>
              ) : null}

              {messagesLoading ? <CardSkeleton lines={6} /> : (
                <ul className="chat-messages">
                  {messages.map((message) => (
                    <li key={message.messageId} className={`chat-message ${message.role}`}>
                      <p className="chat-message-meta">
                        <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                        {" · "}
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                      <p>{message.content}</p>
                      {message.attachments && message.attachments.length > 0 ? (
                        <div className="actions">
                          {message.attachments.map((attachment) => (
                            <span key={attachment.attachmentId} className="token-chip">
                              {attachment.fileName}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <div className="chat-composer">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type your message..."
                  rows={4}
                />
                <div className="actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(event) => void handleAttachFiles(event.target.files)}
                  />
                  <ActionButton label="Send" pending={sending} onClick={handleSend} />
                </div>
                {pendingAttachments.length > 0 ? (
                  <div className="actions">
                    {pendingAttachments.map((item) => (
                      <button
                        key={item.attachmentId}
                        type="button"
                        onClick={() => setPendingAttachments((current) => current.filter((entry) => entry.attachmentId !== item.attachmentId))}
                      >
                        {item.fileName} ×
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
