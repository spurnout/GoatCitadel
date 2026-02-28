import { useEffect, useState } from "react";
import { fetchCronJobs, type CronJobsResponse } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";

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
    return <p>Loading bell tower jobs...</p>;
  }

  return (
    <section>
      <h2>Bell Tower</h2>
      <p className="office-subtitle">Scheduled automations and recurring herd routines.</p>
      <PageGuideCard
        what="Lists scheduled jobs and their last/next run times."
        when="Use this to confirm automation timing and whether jobs are active."
        actions={[
          "Check enabled state before relying on scheduled automation.",
          "Compare last run and next run timestamps for drift.",
          "Correlate missing runs with Pulse events.",
        ]}
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
