import { useEffect, useMemo, useState } from "react";
import { downloadFile, fetchFilesList, uploadFile } from "../api/client";
import { SelectOrCustom } from "../components/SelectOrCustom";

const UPLOAD_PATH_SUGGESTIONS = [
  "notes/example.txt",
  "memory/daily-log.md",
  "docs/quick-notes.md",
  "artifacts/output.txt",
  "workspace/todo.md",
].map((value) => ({ value, label: value }));

export function FilesPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [files, setFiles] = useState<Array<{ relativePath: string; size: number; modifiedAt: string }>>([]);
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedContent, setSelectedContent] = useState<string>("");
  const [uploadPath, setUploadPath] = useState("notes/example.txt");
  const [uploadContent, setUploadContent] = useState("");
  const [showAdvancedUpload, setShowAdvancedUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void fetchFilesList(".", 500)
      .then((res) => {
        setFiles(res.items);
        setSelectedPath((current) => current || res.items[0]?.relativePath || "");
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
      .then((res) => setSelectedContent(res.content))
      .catch((err: Error) => setError(err.message));
  }, [selectedPath]);

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

  const uploadPathOptions = useMemo(() => {
    const dynamic = files.slice(0, 100).map((file) => file.relativePath);
    return [...new Set([...UPLOAD_PATH_SUGGESTIONS.map((item) => item.value), ...dynamic])]
      .map((value) => ({ value, label: value }));
  }, [files]);

  const searchOptions = useMemo(() => {
    const dynamic = files
      .slice(0, 80)
      .map((file) => file.relativePath.split(/[\\/]/)[0])
      .filter((value): value is string => Boolean(value));
    const defaults = ["memory/", "docs/", "src/", "artifacts/", "skills/"];
    return [...new Set([...defaults, ...dynamic])].map((value) => ({ value, label: value }));
  }, [files]);

  const onUpload = async () => {
    try {
      await uploadFile(uploadPath, uploadContent);
      setUploadContent("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section>
      <h2>Trail Files</h2>
      <p className="office-subtitle">Browse and edit workspace artifacts inside GoatCitadel write-jail roots.</p>
      {error ? <p className="error">{error}</p> : null}
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
          <pre className="file-preview">{selectedContent}</pre>
        </article>
      </div>

      <article className="card">
        <h3>Forge / Upload File</h3>
        <div className="controls-row">
          <SelectOrCustom
            value={uploadPath}
            onChange={setUploadPath}
            options={uploadPathOptions}
            customPlaceholder="Custom workspace path"
            customLabel="Upload path"
          />
          <button onClick={onUpload}>Write File</button>
        </div>
        <button onClick={() => setShowAdvancedUpload((current) => !current)}>
          {showAdvancedUpload ? "Hide advanced upload details" : "Show advanced upload details"}
        </button>
        {showAdvancedUpload ? (
          <p className="office-subtitle">
            Advanced upload mode allows arbitrary file paths inside write-jail roots. Stay inside approved directories.
          </p>
        ) : null}
        <textarea
          value={uploadContent}
          onChange={(event) => setUploadContent(event.target.value)}
          rows={8}
          className="full-textarea"
          placeholder="File content"
        />
      </article>
    </section>
  );
}
