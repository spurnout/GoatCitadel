export function InlineApprovalPrompt({
  approvalId,
  toolName,
  reason,
  pending,
  onApprove,
  onDeny,
}: {
  approvalId: string;
  toolName?: string;
  reason?: string;
  pending?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="chat-approval-card">
      <p className="chat-approval-title">Approval required</p>
      <p className="chat-approval-body">
        {toolName ? `Tool: ${toolName}` : "A tool action"} needs approval. {reason ?? "Review and decide."}
      </p>
      <p className="chat-approval-id">Approval ID: {approvalId}</p>
      <div className="chat-approval-actions">
        <button type="button" disabled={pending} onClick={onApprove}>Allow once</button>
        <button type="button" className="danger" disabled={pending} onClick={onDeny}>Deny</button>
      </div>
    </div>
  );
}

