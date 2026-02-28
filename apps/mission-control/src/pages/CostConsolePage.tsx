import { useEffect, useState } from "react";
import { fetchCostSummary, runCheaper, type CostSummaryResponse } from "../api/client";

type CostScope = "day" | "session" | "agent" | "task";

export function CostConsolePage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [scope, setScope] = useState<CostScope>("day");
  const [data, setData] = useState<CostSummaryResponse | null>(null);
  const [recommendation, setRecommendation] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCostSummary(scope)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [scope, refreshKey]);

  const onRunCheaper = async () => {
    try {
      const res = await runCheaper();
      setRecommendation(res.actions);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!data) {
    return <p>Loading feed ledger...</p>;
  }

  return (
    <section>
      <h2>Feed Ledger</h2>
      <p className="office-subtitle">Token and cost burn-rate controls for herd operations.</p>
      <div className="controls-row">
        <label htmlFor="scope">Scope</label>
        <select
          id="scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as CostScope)}
        >
          <option value="day">day</option>
          <option value="session">session</option>
          <option value="agent">agent</option>
          <option value="task">task</option>
        </select>
        <button onClick={onRunCheaper}>Run Leaner</button>
      </div>
      {recommendation ? (
        <ul>
          {recommendation.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Scope Key</th>
            <th>Token Input</th>
            <th>Token Output</th>
            <th>Total Tokens</th>
            <th>Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.key}>
              <td>{item.key}</td>
              <td>{item.tokenInput}</td>
              <td>{item.tokenOutput}</td>
              <td>{item.tokenTotal}</td>
              <td>{item.costUsd.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
