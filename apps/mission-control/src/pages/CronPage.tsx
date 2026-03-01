import { useEffect, useState } from "react";
import { fetchCronJobs, type CronJobsResponse } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

export function CronPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<CronJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCronJobs()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  if (error) {
    return <p className="error">{error}</p>;
  }
  if (!data) {
    return <p>Loading schedule data...</p>;
  }

  return (
    <section>
      <h2>{pageCopy.cron.title}</h2>
      <p className="office-subtitle">{pageCopy.cron.subtitle}</p>
      <PageGuideCard
        what={pageCopy.cron.guide?.what ?? ""}
        when={pageCopy.cron.guide?.when ?? ""}
        actions={pageCopy.cron.guide?.actions ?? []}
      />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Schedule</th>
            <th>Enabled</th>
            <th>Last Run</th>
            <th>Next Run</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((job) => (
            <tr key={job.jobId}>
              <td>{job.name}</td>
              <td>{job.schedule}</td>
              <td>{job.enabled ? "yes" : "no"}</td>
              <td>{job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "-"}</td>
              <td>{job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
