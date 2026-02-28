import { useEffect, useMemo, useState } from "react";
import { fetchFilesList } from "../api/client";

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

export function MemoryPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchFilesList(".", 3000)
      .then((res) => {
        setFiles(res.items);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  const areas = useMemo(() => summarizeAreas(files), [files]);
  const areaOptions = useMemo(() => ["all", ...areas.map((area) => area.area)], [areas]);
  const memoryAreas = useMemo(() => summarizeMemorySubspaces(files), [files]);

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
      <h2>Memory</h2>
      <p className="office-subtitle">
        Workspace-aware memory map with per-area drill-down.
      </p>
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
        <input
          placeholder="Filter path..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="split-grid memory-workspace-grid">
        <article className="card">
          <h3>Workspace Areas</h3>
          <ul className="compact-list workspace-area-list">
            {areas.map((area) => (
              <li key={area.area}>
                <button
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
