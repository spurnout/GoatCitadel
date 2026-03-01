import { globalCopy } from "../content/copy";

interface PageGuideCardProps {
  what: string;
  when: string;
  actions: string[];
  terms?: Array<{ term: string; meaning: string }>;
}

export function PageGuideCard(props: PageGuideCardProps) {
  return (
    <article className="card page-guide-card">
      <h3>{globalCopy.guideCard.title}</h3>
      <p><strong>{globalCopy.guideCard.what}:</strong> {props.what}</p>
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
    </article>
  );
}
