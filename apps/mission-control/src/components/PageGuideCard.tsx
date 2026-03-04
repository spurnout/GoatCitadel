import { useEffect, useState } from "react";
import { globalCopy } from "../content/copy";
import { useUiPreferences } from "../state/ui-preferences";

interface PageGuideCardProps {
  what: string;
  when: string;
  mostCommonAction?: string;
  actions: string[];
  terms?: Array<{ term: string; meaning: string }>;
  compact?: boolean;
}

export function PageGuideCard(props: PageGuideCardProps) {
  const { mode } = useUiPreferences();
  const compact = props.compact ?? (mode !== "simple");
  const [expanded, setExpanded] = useState(mode === "simple");

  useEffect(() => {
    setExpanded(mode === "simple");
  }, [mode]);

  return (
    <article className={`card page-guide-card${compact ? " compact" : ""}`}>
      <header className="page-guide-head">
        <h3>{globalCopy.guideCard.title}</h3>
        {compact ? (
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Hide details" : "Show details"}
          </button>
        ) : null}
      </header>
      <p className="page-guide-what"><strong>{globalCopy.guideCard.what}:</strong> {props.what}</p>
      {!compact || expanded ? (
        <>
          <p><strong>{globalCopy.guideCard.when}:</strong> {props.when}</p>
          {props.mostCommonAction ? (
            <p><strong>{globalCopy.guideCard.mostCommonAction}:</strong> {props.mostCommonAction}</p>
          ) : null}
          <p><strong>{globalCopy.guideCard.actions}:</strong></p>
          <ol>
            {props.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
          {props.terms && props.terms.length > 0 ? (
            <>
              <p><strong>{globalCopy.guideCard.terms}:</strong></p>
              <ul>
                {props.terms.map((item) => (
                  <li key={item.term}>
                    <strong>{item.term}:</strong> {item.meaning}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
