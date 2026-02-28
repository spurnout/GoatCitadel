import { useEffect, useMemo, useState } from "react";
import { downloadFile, fetchFilesList, uploadFile } from "../api/client";

export function FilesPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [files, setFiles] = useState<Array<{ relativePath: string; size: number; modifiedAt: string }>>([]);
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedContent, setSelectedContent] = useState<string>("");
  const [uploadPath, setUploadPath] = useState("notes/example.txt");
  const [uploadContent, setUploadContent] = useState("");
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
      <h2>Files</h2>
      <p className="office-subtitle">Browse and edit workspace files inside the write jail roots.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="controls-row">
        <input
          placeholder="Filter files..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="split-grid">
        <article className="card">
          <h3>Workspace Files</h3>
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
          <h3>Preview</h3>
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
        <h3>Upload / Create File</h3>
        <div className="controls-row">
          <input value={uploadPath} onChange={(event) => setUploadPath(event.target.value)} />
          <button onClick={onUpload}>Write File</button>
        </div>
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
