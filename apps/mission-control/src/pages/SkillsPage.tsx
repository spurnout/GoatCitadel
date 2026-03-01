import { useEffect, useState } from "react";
import { fetchSkills, reloadSkills } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

interface SkillsState {
  items: Array<{
    skillId: string;
    name: string;
    source: string;
    dir: string;
    declaredTools: string[];
    requires: string[];
    keywords: string[];
    mtime: string;
  }>;
}

export function SkillsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<SkillsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void fetchSkills()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const onReload = async () => {
    try {
      await reloadSkills();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error) {
    return <p className="error">{error}</p>;
  }
  if (!data) {
    return <p>Loading Playbook skills...</p>;
  }

  return (
    <section>
      <h2>{pageCopy.skills.title}</h2>
      <p className="office-subtitle">{pageCopy.skills.subtitle}</p>
      <PageGuideCard
        what={pageCopy.skills.guide?.what ?? ""}
        when={pageCopy.skills.guide?.when ?? ""}
        actions={pageCopy.skills.guide?.actions ?? []}
        terms={pageCopy.skills.guide?.terms}
      />
      <div className="controls-row">
        <button onClick={onReload}>Reload Playbook</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Source</th>
            <th>Tools</th>
            <th>Requires</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((skill) => (
            <tr key={skill.skillId}>
              <td>{skill.name}</td>
              <td>{skill.source}</td>
              <td>{skill.declaredTools.join(", ") || "-"}</td>
              <td>{skill.requires.join(", ") || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
