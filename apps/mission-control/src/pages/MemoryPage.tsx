import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFilesList, fetchMemoryQmdStats } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

interface WorkspaceFile {
  relativePath: string;
  size: number;
  modifiedAt: string;
}

interface WorkspaceAreaSummary {
  area: string;
  files: WorkspaceFile[];
  totalBytes: number;
  latestModifiedAt?: string;
}

export function MemoryPage({ refreshKey: _refreshKey = 0, workspaceId = "default" }: { refreshKey?: number; workspaceId?: string }) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFallbackRefreshing, setIsFallbackRefreshing] = useState(false);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [qmdStats, setQmdStats] = useState<{
    totalRuns: number;
    generatedRuns: number;
    cacheHitRuns: number;
    fallbackRuns: number;
    failedRuns: number;
    originalTokenEstimate: number;
    distilledTokenEstimate: number;
    savingsPercent: number;
    netTokenDelta: number;
    compressionPercent: number;
    expansionPercent: number;
    efficiencyLabel: "reduced" | "expanded" | "neutral";
    recent: Array<{ contextId: string; scope: string; createdAt: string; quality: { status: string } }>;
  } | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const workspacePrefix = useMemo(
    () => (workspaceId && workspaceId !== "default" ? `workspaces/${workspaceId}/` : ""),
    [workspaceId],
  );

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [filesRes, stats] = await Promise.all([
        fetchFilesList(".", 3000),
        fetchMemoryQmdStats(),
      ]);
      const scopedFiles = workspacePrefix
        ? filesRes.items
          .filter((item) => item.relativePath.startsWith(workspacePrefix))
          .map((item) => ({
            ...item,
            relativePath: item.relativePath.slice(workspacePrefix.length),
          }))
        : filesRes.items;
      setFiles(scopedFiles);
      setQmdStats({
        ...stats,
        recent: stats.recent.map((item) => ({
          contextId: item.contextId,
          scope: item.scope,
          createdAt: item.createdAt,
          quality: { status: item.quality.status },
        })),
      });
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
  }, [workspacePrefix]);

  useEffect(() => {
    void load({ background: false });
  }, [load]);

  useRefreshSubscription(
    "memory",
    async () => {
      await load({ background: true });
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1100,
      staleMs: 20000,
      pollIntervalMs: 15000,
      onFallbackStateChange: setIsFallbackRefreshing,
    },
  );

  const areas = useMemo(() => summarizeAreas(files), [files]);
  const areaOptions = useMemo(() => ["all", ...areas.map((area) => area.area)], [areas]);
  const memoryAreas = useMemo(() => summarizeMemorySubspaces(files), [files]);
  const searchOptions = useMemo(() => {
    const defaults = ["memory/", "data/", "docs/", "skills/", "logs/"];
    const discovered = files.slice(0, 120).map((file) => file.relativePath);
    return [...new Set([...defaults, ...discovered])].map((value) => ({ value, label: value }));
  }, [files]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return files.filter((file) => {
      const fileArea = topLevelArea(file.relativePath);
      if (selectedArea !== "all" && fileArea !== selectedArea) {
        return false;
      }
      if (!query) {
        return true;
      }
      return file.relativePath.toLowerCase().includes(query);
    });
  }, [files, search, selectedArea]);

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const memoryFilesCount = useMemo(
    () => files.filter((file) => file.relativePath.startsWith("memory/")).length,
    [files],
  );
  const hottestArea = useMemo(() => areas[0], [areas]);

  return (
    <section className="memory-v2">
      <h2>{pageCopy.memory.title}</h2>
      <p className="office-subtitle">{pageCopy.memory.subtitle}</p>
      <PageGuideCard
        what={pageCopy.memory.guide?.what ?? ""}
        when={pageCopy.memory.guide?.when ?? ""}
        mostCommonAction={pageCopy.memory.guide?.mostCommonAction}
        actions={pageCopy.memory.guide?.actions ?? []}
        terms={pageCopy.memory.guide?.terms}
      />
      {isInitialLoading ? <p>Loading memory workspace...</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing memory workspace...</p> : null}
      {isFallbackRefreshing ? (
        <p className="status-banner warning">Live updates degraded, checking periodically.</p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="office-kpi-grid">
        <article className="office-kpi-card">
          <p className="office-kpi-label">Workspace files</p>
          <p className="office-kpi-value">{files.length}</p>
          <p className="office-kpi-note">Tracked across all areas</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Workspace size</p>
          <p className="office-kpi-value">{formatBytes(totalBytes)}</p>
          <p className="office-kpi-note">Total bytes in indexed files</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Memory namespace</p>
          <p className="office-kpi-value">{memoryFilesCount}</p>
          <p className="office-kpi-note">Files under memory/</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Hottest area</p>
          <p className="office-kpi-value">{hottestArea?.area ?? "-"}</p>
          <p className="office-kpi-note">
            {hottestArea ? `${formatBytes(hottestArea.totalBytes)} total` : "No files indexed"}
          </p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">QMD Runs (24h)</p>
          <p className="office-kpi-value">{qmdStats?.totalRuns ?? 0}</p>
          <p className="office-kpi-note">Generated {qmdStats?.generatedRuns ?? 0} / cache hits {qmdStats?.cacheHitRuns ?? 0}</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">QMD Context Impact</p>
          <p className="office-kpi-value">{qmdStats ? describeQmdImpact(qmdStats) : "-"}</p>
          <p className="office-kpi-note">
            {qmdStats
              ? `Went from ${qmdStats.originalTokenEstimate} tokens to ${qmdStats.distilledTokenEstimate} (${formatTokenDelta(qmdStats.netTokenDelta)}).`
              : "No QMD samples yet"}
          </p>
        </article>
      </div>

      <div className="controls-row">
        <select
          value={selectedArea}
          onChange={(event) => setSelectedArea(event.target.value)}
        >
          {areaOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <SelectOrCustom
          value={search}
          onChange={setSearch}
          options={searchOptions}
          customPlaceholder="Filter by path text"
          customLabel="Path filter"
        />
      </div>

      <div className="split-grid memory-workspace-grid">
        <article className="card">
          <h3>Workspace Areas</h3>
          <ul className="compact-list workspace-area-list">
            {areas.map((area) => (
              <li key={area.area}>
                <button type="button"
                  className={selectedArea === area.area ? "active" : ""}
                  onClick={() => setSelectedArea(area.area)}
                >
                  <strong>{area.area}</strong>
                  <span>{area.files.length} files</span>
                  <span>{formatBytes(area.totalBytes)}</span>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h3>Files {selectedArea !== "all" ? `(${selectedArea})` : "(all areas)"}</h3>
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Area</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((file) => (
                <tr key={file.relativePath}>
                  <td>{file.relativePath}</td>
                  <td>{topLevelArea(file.relativePath)}</td>
                  <td>{formatBytes(file.size)}</td>
                  <td>{new Date(file.modifiedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 ? (
            <p className="office-subtitle">Showing first 300 rows of {filtered.length} matching files.</p>
          ) : null}
        </article>
      </div>

      <article className="card">
        <h3>memory/ Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Memory Workspace</th>
              <th>Files</th>
              <th>Total Size</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {memoryAreas.length === 0 ? (
              <tr>
                <td colSpan={4}>No memory/* subspaces discovered.</td>
              </tr>
            ) : memoryAreas.map((area) => (
              <tr key={area.area}>
                <td>{area.area}</td>
                <td>{area.files.length}</td>
                <td>{formatBytes(area.totalBytes)}</td>
                <td>{area.latestModifiedAt ? new Date(area.latestModifiedAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="card">
        <h3>Recent Distilled Context Packs</h3>
        <table>
          <thead>
            <tr>
              <th>Context ID</th>
              <th>Scope</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {!qmdStats || qmdStats.recent.length === 0 ? (
              <tr>
                <td colSpan={4}>No QMD contexts generated yet.</td>
              </tr>
            ) : qmdStats.recent.slice(0, 20).map((item) => (
              <tr key={item.contextId}>
                <td>{item.contextId}</td>
                <td>{item.scope}</td>
                <td>{item.quality.status}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function summarizeAreas(files: WorkspaceFile[]): WorkspaceAreaSummary[] {
  const byArea = new Map<string, WorkspaceAreaSummary>();
  for (const file of files) {
    const area = topLevelArea(file.relativePath);
    const current = byArea.get(area) ?? {
      area,
      files: [],
      totalBytes: 0,
      latestModifiedAt: undefined,
    };
    current.files.push(file);
    current.totalBytes += file.size;
    current.latestModifiedAt = pickLatestTimestamp(current.latestModifiedAt, file.modifiedAt);
    byArea.set(area, current);
  }

  return [...byArea.values()].sort((left, right) => right.totalBytes - left.totalBytes);
}

function summarizeMemorySubspaces(files: WorkspaceFile[]): WorkspaceAreaSummary[] {
  const memoryFiles = files.filter((file) => file.relativePath.startsWith("memory/"));
  const byArea = new Map<string, WorkspaceAreaSummary>();

  for (const file of memoryFiles) {
    const parts = file.relativePath.split("/");
    const area = parts[1] ? `memory/${parts[1]}` : "memory/(root)";
    const current = byArea.get(area) ?? {
      area,
      files: [],
      totalBytes: 0,
      latestModifiedAt: undefined,
    };
    current.files.push(file);
    current.totalBytes += file.size;
    current.latestModifiedAt = pickLatestTimestamp(current.latestModifiedAt, file.modifiedAt);
    byArea.set(area, current);
  }

  return [...byArea.values()].sort((left, right) => right.totalBytes - left.totalBytes);
}

function topLevelArea(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const [first] = normalized.split("/");
  return first && first.length > 0 ? first : "(root)";
}

function pickLatestTimestamp(current?: string, incoming?: string): string | undefined {
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }
  return Date.parse(incoming) >= Date.parse(current) ? incoming : current;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function describeQmdImpact(stats: {
  efficiencyLabel: "reduced" | "expanded" | "neutral";
  compressionPercent: number;
  expansionPercent: number;
}): string {
  if (stats.efficiencyLabel === "reduced") {
    return `Reduced ${stats.compressionPercent.toFixed(1)}%`;
  }
  if (stats.efficiencyLabel === "expanded") {
    return `Grew ${stats.expansionPercent.toFixed(1)}%`;
  }
  return "Stable";
}

function formatTokenDelta(delta: number): string {
  if (delta > 0) {
    return `+${Math.round(delta)} tokens`;
  }
  if (delta < 0) {
    return `${Math.round(delta)} tokens`;
  }
  return "no change";
}

