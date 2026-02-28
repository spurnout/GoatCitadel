interface PageGuideCardProps {
  what: string;
  when: string;
  actions: string[];
  terms?: Array<{ term: string; meaning: string }>;
}

export function PageGuideCard(props: PageGuideCardProps) {
  return (
    <article className="card page-guide-card">
      <h3>How To Use This Page</h3>
      <p><strong>What this does:</strong> {props.what}</p>
      <p><strong>When to use it:</strong> {props.when}</p>
      <p><strong>Common actions:</strong></p>
      <ol>
        {props.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ol>
      {props.terms && props.terms.length > 0 ? (
        <>
          <p><strong>Terms explained:</strong></p>
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

