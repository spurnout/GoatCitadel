import { useEffect, useState } from "react";
import { connectEventStream, fetchRealtimeEvents, type RealtimeEvent } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

export function ActivityPage() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRealtimeEvents(200)
      .then((res) => setEvents(res.items))
      .catch((err: Error) => setError(err.message));

    const close = connectEventStream((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 300));
    });

    return () => {
      close();
    };
  }, []);

  return (
    <section>
      <h2>{pageCopy.activity.title}</h2>
      <p className="office-subtitle">{pageCopy.activity.subtitle}</p>
      <PageGuideCard
        what={pageCopy.activity.guide?.what ?? ""}
        when={pageCopy.activity.guide?.when ?? ""}
        actions={pageCopy.activity.guide?.actions ?? []}
      />
      {error ? <p className="error">{error}</p> : null}
      <ul className="compact-list">
        {events.map((event) => (
          <li key={event.eventId}>
            <strong>{event.eventType}</strong> ({event.source}) {new Date(event.timestamp).toLocaleString()}
            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
