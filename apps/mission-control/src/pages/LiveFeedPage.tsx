import { useEffect, useState } from "react";
import { connectEventStream, fetchRealtimeEvents, type RealtimeEvent } from "../api/client";

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
      <h2>Live Feed</h2>
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
