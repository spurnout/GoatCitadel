import { useCallback, useEffect, useState } from "react";
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
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

export function MeshPage() {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFallbackRefreshing, setIsFallbackRefreshing] = useState(false);
  const [status, setStatus] = useState<MeshStatusResponse | null>(null);
  const [nodes, setNodes] = useState<MeshNodeRecord[]>([]);
  const [leases, setLeases] = useState<MeshLeaseRecord[]>([]);
  const [owners, setOwners] = useState<MeshSessionOwnerRecord[]>([]);
  const [offsets, setOffsets] = useState<MeshReplicationOffsetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [statusRes, nodesRes, leasesRes, ownersRes, offsetsRes] = await Promise.all([
        fetchMeshStatus(),
        fetchMeshNodes(),
        fetchMeshLeases(),
        fetchMeshSessionOwners(),
        fetchMeshReplicationOffsets(),
      ]);
      setStatus(statusRes);
      setNodes(nodesRes.items);
      setLeases(leasesRes.items);
      setOwners(ownersRes.items);
      setOffsets(offsetsRes.items);
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
  }, []);

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

  if (isInitialLoading || !status) {
    return <p>Loading mesh telemetry...</p>;
  }

  return (
    <section>
      <h2>{pageCopy.mesh.title}</h2>
      <p className="office-subtitle">{pageCopy.mesh.subtitle}</p>
      <PageGuideCard
        what={pageCopy.mesh.guide?.what ?? ""}
        when={pageCopy.mesh.guide?.when ?? ""}
        mostCommonAction={pageCopy.mesh.guide?.mostCommonAction}
        actions={pageCopy.mesh.guide?.actions ?? []}
        terms={pageCopy.mesh.guide?.terms}
      />
      {isRefreshing ? <p className="status-banner">Refreshing mesh status...</p> : null}
      {isFallbackRefreshing ? (
        <p className="status-banner warning">Live updates degraded, checking periodically.</p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <article className="card">
        <h3>
          Mesh Health Summary
          <HelpHint label="Mesh summary help" text="Mesh is only needed when multiple GoatCitadel nodes coordinate across machines. For single-machine use, disabled is normal." />
        </h3>
        <p>
          {status.enabled
            ? `Mesh is enabled in ${status.mode} mode with ${status.nodesOnline} online node(s).`
            : "Mesh is currently disabled for this runtime."}
        </p>
        <ul className="improvement-simple-list">
          <li>{status.enabled ? "OK" : "Needs setup"} - Mesh feature is enabled.</li>
          <li>{status.nodesOnline > 0 ? "OK" : "Needs attention"} - At least one node is online.</li>
          <li>{status.tailnetEnabled ? "OK" : "Optional"} - Tailnet routing is {status.tailnetEnabled ? "on" : "off"}.</li>
          <li>{status.activeLeases >= 0 ? "OK" : "Needs attention"} - Lease telemetry is reporting.</li>
        </ul>
      </article>

      <div className="metric-grid">
        <article className="card">
          <h3>Cluster Status</h3>
          <p>Enabled: {status.enabled ? "yes" : "no"}</p>
          <p>Mode: {status.mode} <HelpHint label="Mesh mode help" text="LAN uses local-network discovery, WAN assumes explicitly reachable peers, and tailnet is for private-network overlays such as Tailscale." /></p>
          <p>Local node: {status.localNodeId} <HelpHint label="Local node help" text="This node ID is this machine's stable identity inside the mesh. It should be unique per machine." /></p>
          <p>Tailnet mode: {status.tailnetEnabled ? "on" : "off"} <HelpHint label="Tailnet help" text="Tailnet mode is for private-network routing. Leave it off unless you intentionally run GoatCitadel across a tailnet." /></p>
        </article>
        <article className="card">
          <h3>Live Counters</h3>
          <p>Online nodes: {status.nodesOnline}</p>
          <p>Active leases: {status.activeLeases} <HelpHint label="Active leases help" text="Leases are short-lived ownership locks used to coordinate work safely across multiple nodes." /></p>
          <p>Owned sessions: {status.ownedSessions} <HelpHint label="Owned sessions help" text="Sessions currently claimed by this node for single-writer coordination." /></p>
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
