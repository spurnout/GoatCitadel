import { useEffect, useState } from "react";
import {
  fetchMeshLeases,
  fetchMeshNodes,
  fetchMeshReplicationOffsets,
  fetchMeshSessionOwners,
  fetchMeshStatus,
  type MeshLeaseRecord,
  type MeshNodeRecord,
  type MeshReplicationOffsetRecord,
  type MeshSessionOwnerRecord,
  type MeshStatusResponse,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";

export function MeshPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [status, setStatus] = useState<MeshStatusResponse | null>(null);
  const [nodes, setNodes] = useState<MeshNodeRecord[]>([]);
  const [leases, setLeases] = useState<MeshLeaseRecord[]>([]);
  const [owners, setOwners] = useState<MeshSessionOwnerRecord[]>([]);
  const [offsets, setOffsets] = useState<MeshReplicationOffsetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchMeshStatus(),
      fetchMeshNodes(),
      fetchMeshLeases(),
      fetchMeshSessionOwners(),
      fetchMeshReplicationOffsets(),
    ])
      .then(([statusRes, nodesRes, leasesRes, ownersRes, offsetsRes]) => {
        setStatus(statusRes);
        setNodes(nodesRes.items);
        setLeases(leasesRes.items);
        setOwners(ownersRes.items);
        setOffsets(offsetsRes.items);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  if (!status) {
    return <p>Loading mesh telemetry...</p>;
  }

  return (
    <section>
      <h2>Mesh</h2>
      <p className="office-subtitle">
        LAN-first node federation with lease fencing, session ownership, replication offsets, and tailnet readiness.
      </p>
      <PageGuideCard
        what="Mesh shows distributed node coordination, leadership leases, and session ownership."
        when="Use this when running GoatCitadel across multiple machines or validating failover behavior."
        actions={[
          "Check cluster status and online node count.",
          "Inspect lease fencing tokens and expiry windows.",
          "Verify session ownership and replication offsets.",
        ]}
        terms={[
          { term: "Lease fencing", meaning: "Monotonic token system that prevents stale leaders from writing." },
          { term: "Session ownership", meaning: "Single-writer lock for a session across nodes." },
        ]}
      />
      {error ? <p className="error">{error}</p> : null}

      <div className="metric-grid">
        <article className="card">
          <h3>Cluster Status</h3>
          <p>Enabled: {status.enabled ? "yes" : "no"}</p>
          <p>Mode: {status.mode}</p>
          <p>Local node: {status.localNodeId}</p>
          <p>Tailnet mode: {status.tailnetEnabled ? "on" : "off"}</p>
        </article>
        <article className="card">
          <h3>Live Counters</h3>
          <p>Online nodes: {status.nodesOnline}</p>
          <p>Active leases: {status.activeLeases}</p>
          <p>Owned sessions: {status.ownedSessions}</p>
        </article>
      </div>

      <div className="split-grid">
        <article className="card">
          <h3>Nodes</h3>
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Status</th>
                <th>Transport</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {nodes.length === 0 ? (
                <tr><td colSpan={4}>No nodes discovered.</td></tr>
              ) : nodes.map((node) => (
                <tr key={node.nodeId}>
                  <td>{node.label ?? node.nodeId}</td>
                  <td>{node.status}</td>
                  <td>{node.transport}</td>
                  <td>{new Date(node.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h3>Leases</h3>
          <table>
            <thead>
              <tr>
                <th>Lease</th>
                <th>Holder</th>
                <th>Fencing</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {leases.length === 0 ? (
                <tr><td colSpan={4}>No leases active.</td></tr>
              ) : leases.map((lease) => (
                <tr key={lease.leaseKey}>
                  <td>{lease.leaseKey}</td>
                  <td>{lease.holderNodeId}</td>
                  <td>{lease.fencingToken}</td>
                  <td>{new Date(lease.expiresAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="split-grid">
        <article className="card">
          <h3>Session Ownership</h3>
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Owner</th>
                <th>Epoch</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {owners.length === 0 ? (
                <tr><td colSpan={4}>No claimed sessions.</td></tr>
              ) : owners.map((owner) => (
                <tr key={owner.sessionId}>
                  <td>{owner.sessionId}</td>
                  <td>{owner.ownerNodeId}</td>
                  <td>{owner.epoch}</td>
                  <td>{new Date(owner.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h3>Replication Offsets</h3>
          <table>
            <thead>
              <tr>
                <th>Consumer</th>
                <th>Source</th>
                <th>Last Event</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {offsets.length === 0 ? (
                <tr><td colSpan={4}>No replication offsets recorded.</td></tr>
              ) : offsets.map((offset) => (
                <tr key={`${offset.consumerNodeId}-${offset.sourceNodeId}`}>
                  <td>{offset.consumerNodeId}</td>
                  <td>{offset.sourceNodeId}</td>
                  <td>{offset.lastReplicationId ?? "-"}</td>
                  <td>{new Date(offset.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </section>
  );
}
