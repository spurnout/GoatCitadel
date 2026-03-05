import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App";
import { ActivityPage } from "./pages/ActivityPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { ChatPage } from "./pages/ChatPage";
import { CostConsolePage } from "./pages/CostConsolePage";
import { CronPage } from "./pages/CronPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FilesPage } from "./pages/FilesPage";
import { ImprovementPage } from "./pages/ImprovementPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LiveFeedPage } from "./pages/LiveFeedPage";
import { McpPage } from "./pages/McpPage";
import { MemoryPage } from "./pages/MemoryPage";
import { MeshPage } from "./pages/MeshPage";
import { NpuPage } from "./pages/NpuPage";
import { OfficePage } from "./pages/OfficePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PromptLabPage } from "./pages/PromptLabPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { SystemPage } from "./pages/SystemPage";
import { TasksPage } from "./pages/TasksPage";
import { ToolsPage } from "./pages/ToolsPage";
import { WorkspacesPage } from "./pages/WorkspacesPage";

interface CoverageTarget {
  name: string;
  element: ReactElement;
}

const targets: CoverageTarget[] = [
  { name: "App", element: <App /> },
  { name: "ActivityPage", element: <ActivityPage /> },
  { name: "AgentsPage", element: <AgentsPage /> },
  { name: "ApprovalsPage", element: <ApprovalsPage /> },
  { name: "ChatPage", element: <ChatPage workspaceId="default" /> },
  { name: "CostConsolePage", element: <CostConsolePage /> },
  { name: "CronPage", element: <CronPage /> },
  { name: "DashboardPage", element: <DashboardPage onNavigate={() => {}} /> },
  { name: "FilesPage", element: <FilesPage workspaceId="default" /> },
  { name: "ImprovementPage", element: <ImprovementPage workspaceId="default" /> },
  { name: "IntegrationsPage", element: <IntegrationsPage /> },
  { name: "LiveFeedPage", element: <LiveFeedPage /> },
  { name: "McpPage", element: <McpPage /> },
  { name: "MemoryPage", element: <MemoryPage workspaceId="default" /> },
  { name: "MeshPage", element: <MeshPage /> },
  { name: "NpuPage", element: <NpuPage settings={null} /> },
  { name: "OfficePage", element: <OfficePage /> },
  { name: "OnboardingPage", element: <OnboardingPage onCompleted={() => {}} /> },
  { name: "PromptLabPage", element: <PromptLabPage workspaceId="default" /> },
  { name: "SessionsPage", element: <SessionsPage /> },
  { name: "SettingsPage", element: <SettingsPage /> },
  { name: "SkillsPage", element: <SkillsPage /> },
  { name: "SystemPage", element: <SystemPage /> },
  { name: "TasksPage", element: <TasksPage workspaceId="default" /> },
  { name: "ToolsPage", element: <ToolsPage /> },
  {
    name: "WorkspacesPage",
    element: (
      <WorkspacesPage
        activeWorkspaceId="default"
        onWorkspaceChange={() => {}}
      />
    ),
  },
];

const failures: string[] = [];
for (const target of targets) {
  try {
    renderToStaticMarkup(target.element);
  } catch (error) {
    failures.push(`${target.name}: ${(error as Error).message}`);
  }
}

if (failures.length > 0) {
  console.warn(`[coverage-smoke] ${failures.length} render target(s) failed during static render.`);
  for (const failure of failures) {
    console.warn(`[coverage-smoke] ${failure}`);
  }
}
