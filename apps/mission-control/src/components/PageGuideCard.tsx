import { useState } from "react";
import { globalCopy } from "../content/copy";

interface PageGuideCardProps {
  what: string;
  when: string;
  actions: string[];
  terms?: Array<{ term: string; meaning: string }>;
  compact?: boolean;
}

export function PageGuideCard(props: PageGuideCardProps) {
  const [expanded, setExpanded] = useState(false);
  const compact = props.compact ?? true;
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
