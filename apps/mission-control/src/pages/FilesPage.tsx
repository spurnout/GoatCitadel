import { useEffect, useMemo, useState } from "react";
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

export function FilesPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [files, setFiles] = useState<Array<{ relativePath: string; size: number; modifiedAt: string }>>([]);
  const [templates, setTemplates] = useState<FileTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedContent, setSelectedContent] = useState<string>("");
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

  const load = () => {
    void Promise.all([
      fetchFilesList(".", 500),
      fetchFileTemplates(),
    ])
      .then(([filesRes, templatesRes]) => {
        setFiles(filesRes.items);
        setTemplates(templatesRes.items);
        setSelectedPath((current) => current || filesRes.items[0]?.relativePath || "");
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedPath) {
      setSelectedContent("");
      return;
    }
    void downloadFile(selectedPath)
      .then((res) => {
        if (typeof res.content === "string") {
          setSelectedContent(res.content);
        } else {
          setSelectedContent("[binary file]");
        }
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

  const onSaveFile = async () => {
    try {
      const saved = await uploadFile(uploadPath, uploadContent);
      setUploadContent("");
      setInfo(`Saved file: ${saved.relativePath}`);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCreateTemplate = async (templateId: string, targetPath?: string) => {
    try {
      const created = await createFileFromTemplate(templateId, targetPath);
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
    if (!selectedPath) {
      return;
    }
    setUploadPath(selectedPath);
    setAutoPopulatedPath(selectedPath);
    setUploadContent(selectedContent);
    setInfo("Loaded selected file content into editor.");
  };

  const autoPathEdited = Boolean(autoPopulatedPath && autoPopulatedPath !== uploadPath);

  return (
    <section>
      <h2>Trail Files</h2>
      <p className="office-subtitle">Browse and edit workspace artifacts inside GoatCitadel write-jail roots.</p>
      <PageGuideCard
        what="Trail Files is where you inspect, create, and edit files in your workspace safely."
        when="Use this for documentation, artifacts, quick notes, and direct file edits."
        actions={[
          "Pick an existing file to preview it.",
          "Use a template to create a beginner-friendly artifact.",
          "Edit content and click Save File.",
        ]}
        terms={[
          {
            term: "Artifact",
            meaning: "A concrete output file produced by work, like a report, bug summary, or release note.",
          },
        ]}
      />

      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="office-subtitle">{info}</p> : null}

      <article className="card">
        <h3>Create Example Artifact</h3>
        <p className="office-subtitle">
          Start with a template if you are unsure where artifacts should go.
        </p>
        <div className="actions">
          {templates.map((template) => (
            <button key={template.templateId} onClick={() => void onCreateTemplate(template.templateId)}>
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
          <ul className="compact-list files-list">
            {filteredFiles.map((file) => (
              <li key={file.relativePath}>
                <button
                  className={selectedPath === file.relativePath ? "active" : ""}
                  onClick={() => setSelectedPath(file.relativePath)}
                >
                  {file.relativePath}
                </button>
              </li>
            ))}
          </ul>
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
            <button onClick={onUseSelectedPath} disabled={!selectedPath}>Use Selected Path</button>
            <button onClick={onEditSelectedFile} disabled={!selectedPath}>Edit Selected File</button>
          </div>
          <pre className="file-preview">{selectedContent}</pre>
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
          <button onClick={() => void onSaveFile()}>Save File</button>
        </div>
        <div className="controls-row">
          <ChangeBadge level={pathRisk.overall} />
          {autoPathEdited ? <span className="office-subtitle">Path edited after auto-populate.</span> : null}
        </div>
        <button onClick={() => setShowAdvancedUpload((current) => !current)}>
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
