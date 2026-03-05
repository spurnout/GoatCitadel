import { useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  createFileFromTemplate,
  downloadFile,
  evaluateUiChangeRisk,
  fetchFilesList,
  fetchFileTemplates,
  uploadFile,
  type FileTemplate,
} from "../api/client";
import { ChangeBadge, type UiRiskLevel } from "../components/ChangeBadge";
import { ChangeReviewPanel } from "../components/ChangeReviewPanel";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { SmartPathInput } from "../components/SmartPathInput";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

interface TrailFileDownload {
  relativePath: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
  contentType: string;
  encoding: string;
  content: string;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
  "tif",
  "tiff",
]);

export function FilesPage({ workspaceId = "default" }: { workspaceId?: string }) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFallbackRefreshing, setIsFallbackRefreshing] = useState(false);
  const [files, setFiles] = useState<Array<{ relativePath: string; size: number; modifiedAt: string }>>([]);
  const [templates, setTemplates] = useState<FileTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<TrailFileDownload | null>(null);
  const [uploadPath, setUploadPath] = useState("notes/example.txt");
  const [uploadContent, setUploadContent] = useState("");
  const [autoPopulatedPath, setAutoPopulatedPath] = useState<string | null>(null);
  const [pathRisk, setPathRisk] = useState<{
    overall: UiRiskLevel;
    items: Array<{ field: string; level: UiRiskLevel; hint?: string }>;
  }>({
    overall: "safe",
    items: [],
  });
  const [showAdvancedUpload, setShowAdvancedUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const workspacePrefix = useMemo(
    () => (workspaceId && workspaceId !== "default" ? `workspaces/${workspaceId}/` : ""),
    [workspaceId],
  );

  const toWorkspacePath = useCallback((value: string) => {
    const normalized = value.trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!workspacePrefix) {
      return normalized;
    }
    if (!normalized) {
      return workspacePrefix;
    }
    if (normalized.startsWith(workspacePrefix)) {
      return normalized;
    }
    return `${workspacePrefix}${normalized}`;
  }, [workspacePrefix]);

  useEffect(() => {
    setUploadPath((current) => toWorkspacePath(current || "notes/example.txt"));
  }, [toWorkspacePath]);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [filesRes, templatesRes] = await Promise.all([
        fetchFilesList(".", 500),
        fetchFileTemplates(),
      ]);
      const scopedFiles = workspacePrefix
        ? filesRes.items.filter((item) => item.relativePath.startsWith(workspacePrefix))
        : filesRes.items;
      setFiles(scopedFiles);
      setTemplates(templatesRes.items);
      setSelectedPath((current) => current || scopedFiles[0]?.relativePath || "");
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
    "files",
    async () => {
      await load({ background: true });
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1000,
      staleMs: 20000,
      pollIntervalMs: 15000,
      onFallbackStateChange: setIsFallbackRefreshing,
    },
  );

  useEffect(() => {
    if (!selectedPath) {
      setSelectedFile(null);
      return;
    }
    void downloadFile(selectedPath)
      .then((res) => {
        setSelectedFile(res);
      })
      .catch((err: Error) => setError(err.message));
  }, [selectedPath]);

  useEffect(() => {
    const from = autoPopulatedPath ?? uploadPath;
    void evaluateUiChangeRisk({
      pageId: "files",
      changes: [
        {
          field: "uploadPath",
          from,
          to: uploadPath,
        },
      ],
    })
      .then((res) => {
        setPathRisk({
          overall: res.overall,
          items: res.items.map((item) => ({
            field: item.field,
            level: item.level,
            hint: item.hint,
          })),
        });
      })
      .catch(() => {
        setPathRisk({
          overall: "warning",
          items: [{
            field: "uploadPath",
            level: "warning",
            hint: "Risk preflight unavailable; local validation only.",
          }],
        });
      });
  }, [autoPopulatedPath, uploadPath]);

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return files;
    }
    return files.filter((file) => file.relativePath.toLowerCase().includes(query));
  }, [files, search]);

  const selectedMeta = useMemo(
    () => files.find((file) => file.relativePath === selectedPath),
    [files, selectedPath],
  );

  const searchOptions = useMemo(() => {
    const dynamic = files
      .slice(0, 80)
      .map((file) => file.relativePath.split(/[\\/]/)[0])
      .filter((value): value is string => Boolean(value));
    const defaults = ["memory/", "docs/", "src/", "artifacts/", "skills/"];
    return [...new Set([...defaults, ...dynamic])].map((value) => ({ value, label: value }));
  }, [files]);

  const selectedIsImage = useMemo(
    () => isImageFile(selectedPath, selectedFile?.contentType),
    [selectedFile?.contentType, selectedPath],
  );

  const selectedCanEdit = selectedFile?.encoding === "utf8";

  const selectedImageSrc = useMemo(() => {
    if (!selectedFile || !selectedIsImage) {
      return null;
    }
    const contentType = selectedFile.contentType || "application/octet-stream";
    if (selectedFile.encoding === "base64") {
      return `data:${contentType};base64,${selectedFile.content}`;
    }
    return `data:${contentType};charset=utf-8,${encodeURIComponent(selectedFile.content)}`;
  }, [selectedFile, selectedIsImage]);

  const onSaveFile = async () => {
    try {
      const saved = await uploadFile(toWorkspacePath(uploadPath), uploadContent);
      setUploadContent("");
      setInfo(`Saved file: ${saved.relativePath}`);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCreateTemplate = async (templateId: string, targetPath?: string) => {
    try {
      const created = await createFileFromTemplate(templateId, targetPath ? toWorkspacePath(targetPath) : undefined);
      setInfo(`Created template file: ${created.relativePath}`);
      setSelectedPath(created.relativePath);
      setUploadPath(created.relativePath);
      setAutoPopulatedPath(created.relativePath);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUseSelectedPath = () => {
    if (!selectedPath) {
      return;
    }
    setUploadPath(selectedPath);
    setAutoPopulatedPath(selectedPath);
    setInfo(`Auto-populated save path from selection: ${selectedPath}`);
  };

  const onEditSelectedFile = () => {
    if (!selectedPath || !selectedFile) {
      return;
    }
    if (!selectedCanEdit) {
      setInfo("Selected file is binary/image. Use Use Selected Path, then upload new text content to replace it.");
      return;
    }
    setUploadPath(selectedPath);
    setAutoPopulatedPath(selectedPath);
    setUploadContent(selectedFile.content);
    setInfo("Loaded selected file content into editor.");
  };

  const autoPathEdited = Boolean(autoPopulatedPath && autoPopulatedPath !== uploadPath);

  return (
    <section>
      <h2>{pageCopy.files.title}</h2>
      <p className="office-subtitle">{pageCopy.files.subtitle}</p>
      <PageGuideCard
        what={pageCopy.files.guide?.what ?? ""}
        when={pageCopy.files.guide?.when ?? ""}
        actions={pageCopy.files.guide?.actions ?? []}
        terms={pageCopy.files.guide?.terms}
      />
      {isInitialLoading ? <p>Loading workspace trails...</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing trail files...</p> : null}
      {isFallbackRefreshing ? (
        <p className="status-banner warning">Live updates degraded, checking periodically.</p>
      ) : null}
      <article className="card">
        <h3>How To Use Trail Files</h3>
        <ol className="files-howto-list">
          <li>Find the file in <strong>Workspace Trails</strong> or filter by folder/path text.</li>
          <li>Click a file once to preview it. Image files render as images, not text.</li>
          <li>Use <strong>Use Selected Path</strong> to safely prefill the save path.</li>
          <li>Use <strong>Edit Selected File</strong> for text files, then update content and save.</li>
          <li>Review the path risk badge and change-review panel before writing.</li>
        </ol>
        <p className="office-subtitle">
          Tip: keep reports in <code>artifacts/</code>, notes in <code>notes/</code>, and avoid saving outside approved workspace paths.
        </p>
      </article>

      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="office-subtitle">{info}</p> : null}

      <article className="card">
        <h3>Create Example Artifact</h3>
        <p className="office-subtitle">
          Start with a template if you are not sure where to begin.
        </p>
        <div className="actions">
          {templates.map((template) => (
            <button type="button" key={template.templateId} onClick={() => void onCreateTemplate(template.templateId)}>
              {template.title}
            </button>
          ))}
        </div>
      </article>

      <div className="controls-row">
        <SelectOrCustom
          value={search}
          onChange={setSearch}
          options={searchOptions}
          customPlaceholder="Filter files by path text"
          customLabel="File filter"
        />
      </div>
      <div className="split-grid">
        <article className="card">
          <h3>Workspace Trails</h3>
          <div className="virtual-list-shell">
            <Virtuoso
              data={filteredFiles}
              itemContent={(_index, file) => (
                <div className="virtual-list-item files-list-item" key={file.relativePath}>
                  <button type="button"
                    className={selectedPath === file.relativePath ? "active" : ""}
                    onClick={() => setSelectedPath(file.relativePath)}
                  >
                    <span className="files-path">{file.relativePath}</span>
                    <span className="files-meta">
                      {formatFileSize(file.size)} | modified {new Date(file.modifiedAt).toLocaleString()}
                    </span>
                  </button>
                </div>
              )}
            />
          </div>
        </article>
        <article className="card">
          <h3>Trail Preview</h3>
          <p>{selectedPath || "No file selected"}</p>
          {selectedMeta ? (
            <p className="office-subtitle">
              {selectedMeta.size} bytes | modified {new Date(selectedMeta.modifiedAt).toLocaleString()}
            </p>
          ) : null}
          <div className="actions">
            <button type="button" onClick={onUseSelectedPath} disabled={!selectedPath}>Use Selected Path</button>
            <button type="button" onClick={onEditSelectedFile} disabled={!selectedPath || !selectedCanEdit}>Edit Selected File</button>
          </div>
          {selectedFile ? (
            selectedIsImage ? (
              selectedImageSrc ? (
                <figure className="file-image-preview-shell">
                  <img
                    className="file-image-preview"
                    src={selectedImageSrc}
                    alt={`Preview of ${selectedPath}`}
                  />
                  <figcaption className="office-subtitle">
                    Image preview ({selectedFile.contentType || "image"}).
                  </figcaption>
                </figure>
              ) : (
                <div className="file-binary-preview">
                  <p>Image file detected, but preview could not be generated.</p>
                </div>
              )
            ) : selectedFile.encoding === "utf8" ? (
              <pre className="file-preview">{selectedFile.content}</pre>
            ) : (
              <div className="file-binary-preview">
                <p>Binary file detected.</p>
                <p className="office-subtitle">
                  Trail preview shows text and images. For other binary files, use the path tools and metadata.
                </p>
              </div>
            )
          ) : (
            <p className="office-subtitle">Select a file to preview.</p>
          )}
        </article>
      </div>

      <article className="card">
        <h3>Save / Upload File</h3>
        <SmartPathInput
          label="Save path"
          value={uploadPath}
          onChange={setUploadPath}
          root="."
          riskLevel={pathRisk.overall}
          placeholder="Custom workspace path"
          helpText="Pick a suggested path or use custom mode for advanced locations."
        />
        <div className="actions">
          <button type="button" onClick={() => void onSaveFile()}>Save File</button>
        </div>
        <div className="controls-row">
          <ChangeBadge level={pathRisk.overall} />
          {autoPathEdited ? <span className="office-subtitle">Path edited after auto-populate.</span> : null}
        </div>
        <button type="button" onClick={() => setShowAdvancedUpload((current) => !current)}>
          {showAdvancedUpload ? "Hide advanced save details" : "Show advanced save details"}
        </button>
        {showAdvancedUpload ? (
          <p className="office-subtitle">
            Advanced mode allows arbitrary file paths inside write-jail roots. Stay in approved directories.
          </p>
        ) : null}
        <textarea
          value={uploadContent}
          onChange={(event) => setUploadContent(event.target.value)}
          rows={8}
          className="full-textarea"
          placeholder="File content"
        />
        <ChangeReviewPanel
          title="Path Change Review"
          overall={pathRisk.overall}
          items={pathRisk.items}
        />
      </article>
    </section>
  );
}

function isImageFile(relativePath: string, contentType?: string): boolean {
  if ((contentType ?? "").toLowerCase().startsWith("image/")) {
    return true;
  }
  const extension = relativePath.split(".").pop()?.trim().toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

