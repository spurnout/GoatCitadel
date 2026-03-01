import { useEffect, useState } from "react";
import {
  fetchApprovalReplay,
  fetchApprovals,
  resolveApproval,
  type ApprovalReplayResponse,
  type ApprovalsResponse,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { ConfirmModal } from "../components/ConfirmModal";
import { CardSkeleton } from "../components/CardSkeleton";
import { useAction } from "../hooks/useAction";
import { pageCopy } from "../content/copy";

export function ApprovalsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [replayById, setReplayById] = useState<Record<string, ApprovalReplayResponse>>({});
  const [pendingDecision, setPendingDecision] = useState<{ approvalId: string; decision: "approve" | "reject" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolveAction = useAction();

  const load = () => {
    void fetchApprovals("pending")
      .then(setData)
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const onResolve = async (approvalId: string, decision: "approve" | "reject") => {
    try {
      const result = await resolveAction.run(async () => resolveApproval(approvalId, decision));
      if (result.executedAction) {
        setError(
          `Approval ${approvalId} resolved and action ${result.executedAction.outcome}: ${result.executedAction.policyReason}`,
        );
      }
      load();
      const replay = await fetchApprovalReplay(approvalId);
      setReplayById((prev) => ({ ...prev, [approvalId]: replay }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onReplay = async (approvalId: string) => {
    try {
      const replay = await fetchApprovalReplay(approvalId);
      setReplayById((prev) => ({ ...prev, [approvalId]: replay }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) {
    return <CardSkeleton lines={7} />;
  }

  return (
    <section>
      <h2>{pageCopy.approvals.title}</h2>
      <p className="office-subtitle">{pageCopy.approvals.subtitle}</p>
      <PageGuideCard
        what={pageCopy.approvals.guide?.what ?? ""}
        when={pageCopy.approvals.guide?.when ?? ""}
        actions={pageCopy.approvals.guide?.actions ?? []}
        terms={pageCopy.approvals.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}
      {data.items.length === 0 ? <p>No pending approvals right now.</p> : null}
      {data.items.map((approval) => {
        const replay = replayById[approval.approvalId];
        const explanationLabel =
          approval.explanationStatus === "pending"
            ? "Pending explanation"
            : approval.explanationStatus === "completed"
              ? "Explained"
              : approval.explanationStatus === "failed"
                ? "Explanation failed"
                : "Not requested";

        const explanationColor =
          approval.explanationStatus === "pending"
            ? "#ffb87a"
            : approval.explanationStatus === "completed"
              ? "#8ee4a1"
              : approval.explanationStatus === "failed"
                ? "#ff8c8c"
                : "#c4885b";

        return (
          <article key={approval.approvalId} className="card">
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h3>{approval.kind}</h3>
              <small>{approval.riskLevel}</small>
            </header>
            <p style={{ marginTop: 0 }}>
              <span
                style={{
                  border: `1px solid ${explanationColor}`,
                  color: explanationColor,
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 12,
                }}
              >
                {explanationLabel}
              </span>
            </p>

            {approval.explanation ? (
              <div className="replay-box">
                <h4>What this action does</h4>
                <p>{approval.explanation.summary}</p>
                <h4>Why it could be risky</h4>
                <p>{approval.explanation.riskExplanation}</p>
                {approval.explanation.saferAlternative ? (
                  <>
                    <h4>Safer alternative</h4>
                    <p>{approval.explanation.saferAlternative}</p>
                  </>
                ) : null}
                <small>
                  Generated {new Date(approval.explanation.generatedAt).toLocaleString()}
                  {approval.explanation.providerId ? ` via ${approval.explanation.providerId}` : ""}
                  {approval.explanation.model ? ` (${approval.explanation.model})` : ""}
                </small>
              </div>
            ) : null}

            {approval.explanationError ? (
              <p className="error">Explainer error: {approval.explanationError}</p>
            ) : null}

            <pre>{JSON.stringify(approval.preview, null, 2)}</pre>
            <div className="actions">
              <button onClick={() => setPendingDecision({ approvalId: approval.approvalId, decision: "approve" })}>Approve</button>
              <button className="danger" onClick={() => setPendingDecision({ approvalId: approval.approvalId, decision: "reject" })}>Reject</button>
              <button onClick={() => onReplay(approval.approvalId)}>Replay</button>
            </div>
            {replay ? (
              <div className="replay-box">
                <h4>Replay Trail</h4>
                <ul>
                  {replay.events.map((event) => (
                    <li key={event.eventId}>
                      <strong>{event.eventType}</strong> by {event.actorId} at {new Date(event.timestamp).toLocaleString()}
                    </li>
                  ))}
                </ul>
                {replay.pendingAction ? (
                  <pre>{JSON.stringify(replay.pendingAction, null, 2)}</pre>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      <ConfirmModal
        open={Boolean(pendingDecision)}
        title={pendingDecision?.decision === "approve" ? "Approve Action" : "Reject Approval"}
        message={
          pendingDecision?.decision === "approve"
            ? "Approve this action and execute it now?"
            : "Reject this approval request?"
        }
        confirmLabel={resolveAction.pending ? "Applying..." : (pendingDecision?.decision === "approve" ? "Approve" : "Reject")}
        danger={pendingDecision?.decision === "reject"}
        onCancel={() => setPendingDecision(null)}
        onConfirm={() => {
          if (!pendingDecision) {
            return;
          }
          void onResolve(pendingDecision.approvalId, pendingDecision.decision).finally(() => {
            setPendingDecision(null);
          });
        }}
      />
    </section>
  );
}
