import { useEffect, useState } from "react";
import { connectEventStream, fetchRealtimeEvents, type RealtimeEvent } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";

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
      <h2>Pulse</h2>
      <p className="office-subtitle">Live event stream across GoatCitadel systems, tools, and workflows.</p>
      <PageGuideCard
        what="Shows realtime events from gateway, tools, approvals, and orchestration."
        when="Use this when debugging behavior or confirming that actions are flowing through the system."
        actions={[
          "Open this tab while you perform an action in another tab.",
          "Watch event names and sources to confirm expected behavior.",
          "Use payload details to trace issues quickly.",
        ]}
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
