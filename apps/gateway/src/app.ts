import Fastify from "fastify";
import cors from "@fastify/cors";
import { gatewayPlugin } from "./plugins/sqlite.js";
import { idempotencyHeaderPlugin } from "./plugins/idempotency.js";
import { healthRoute } from "./routes/health.js";
import { gatewayEventsRoute } from "./routes/gateway-events.js";
import { sessionsListRoute } from "./routes/sessions-list.js";
import { toolsInvokeRoute } from "./routes/tools-invoke.js";
import { approvalsRoutes } from "./routes/approvals.js";
import { costsRoutes } from "./routes/costs.js";
import { skillsRoutes } from "./routes/skills.js";
import { orchestrationRoutes } from "./routes/orchestration.js";
import { tasksRoutes } from "./routes/tasks.js";
import { eventsRoutes } from "./routes/events.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { filesRoutes } from "./routes/files.js";
import { llmRoutes } from "./routes/llm.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(gatewayPlugin);
  await app.register(idempotencyHeaderPlugin);

  await app.register(healthRoute);
  await app.register(gatewayEventsRoute);
  await app.register(sessionsListRoute);
  await app.register(toolsInvokeRoute);
  await app.register(approvalsRoutes);
  await app.register(costsRoutes);
  await app.register(skillsRoutes);
  await app.register(orchestrationRoutes);
  await app.register(tasksRoutes);
  await app.register(eventsRoutes);
  await app.register(dashboardRoutes);
  await app.register(filesRoutes);
  await app.register(llmRoutes);

  return app;
}
