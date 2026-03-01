import { useEffect, useState } from "react";
import { connectEventStream, fetchRealtimeEvents, type RealtimeEvent } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

export function LiveFeedPage() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRealtimeEvents(100)
      .then((res) => setEvents(res.items))
      .catch((err: Error) => setError(err.message));

    const close = connectEventStream((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 200));
    });

    return () => {
      close();
    };
  }, []);

  return (
    <section>
      <h2>{pageCopy.liveFeed.title}</h2>
      <p className="office-subtitle">{pageCopy.liveFeed.subtitle}</p>
      <PageGuideCard
        what={pageCopy.liveFeed.guide?.what ?? ""}
        when={pageCopy.liveFeed.guide?.when ?? ""}
        actions={pageCopy.liveFeed.guide?.actions ?? []}
        terms={pageCopy.liveFeed.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}
      <ul className="compact-list">
        {events.map((event) => (
          <li key={event.eventId}>
            <strong>{event.eventType}</strong> from {event.source} at {new Date(event.timestamp).toLocaleString()}
            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
