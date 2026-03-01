import type { GlobalCopy, PageCopy, PageId, TabId } from "./copy-types";

interface NavItemCopy {
  id: TabId;
  label: string;
  code: string;
}

interface NavSectionCopy {
  label: string;
  items: TabId[];
}

export const globalCopy: GlobalCopy = {
  guideCard: {
    title: "How To Use This Page",
    what: "What this does",
    when: "When to use it",
    actions: "Common actions",
    terms: "Terms explained",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    archive: "Archive",
    restore: "Restore",
    deletePermanently: "Delete Permanently",
    apply: "Apply",
    test: "Test",
    loading: "Loading...",
    noPendingEdits: "No pending edits.",
  },
  selectOrCustom: {
    suggested: "Suggested",
    custom: "Custom",
    selectValue: "Select a value",
    customValueHint: "Current value is custom. Switch to Custom mode to edit it.",
    enterCustom: "Enter custom value",
  },
  commandPalette: {
    placeholder: "Type a page or action...",
  },
  configFormBuilder: {
    noSchema: "No guided schema is available for this connection yet. Use Advanced JSON if needed.",
    showAdvanced: "Show Advanced Fields",
    hideAdvanced: "Hide Advanced Fields",
    enabled: "enabled",
    envRefChip: "ENV Ref",
    customValue: "Custom value",
  },
  smartPathInput: {
    browse: "Browse",
    loadingSuggestions: "Loading path suggestions...",
    editedAfterAutofill: "Path edited after auto-fill.",
  },
};

export const appCopy = {
  brandTitle: "GoatCitadel",
  brandSubtitle: "Mission Control for your AI team",
  quickActionsButton: "Quick Actions (Ctrl/Cmd+K)",
  nextStepTitle: "Next Step",
  streamBanner: "Live stream is {state}. Mission Control will reconnect automatically.",
  sidebar: {
    stream: "Stream",
    onboarding: "Onboarding",
    reconnects: "Reconnects",
    lastEvent: "Last event",
    mode: "Mode",
    localMode: "local herd",
    unknown: "unknown",
    complete: "complete",
    required: "required",
    notAvailable: "n/a",
  },
  navItems: [
    { id: "onboarding", label: "Launch Wizard", code: "NEW" },
    { id: "dashboard", label: "Summit (Dashboard)", code: "SUM" },
    { id: "system", label: "Engine (System)", code: "ENG" },
    { id: "files", label: "Trail Files", code: "FS" },
    { id: "memory", label: "Memory Pasture", code: "MEM" },
    { id: "agents", label: "Goat Crew (Agents)", code: "HERD" },
    { id: "office", label: "Herd HQ (Office)", code: "HQ" },
    { id: "activity", label: "Pulse (Activity)", code: "ACT" },
    { id: "cron", label: "Bell Tower (Cron)", code: "CRN" },
    { id: "sessions", label: "Runs (Sessions)", code: "SES" },
    { id: "skills", label: "Playbook (Skills)", code: "SKL" },
    { id: "costs", label: "Feed Ledger (Costs)", code: "USD" },
    { id: "settings", label: "Forge (Settings)", code: "CFG" },
    { id: "tools", label: "Tool Access", code: "TLS" },
    { id: "approvals", label: "Gatehouse (Approvals)", code: "APR" },
    { id: "tasks", label: "Trailboard (Tasks)", code: "TSK" },
    { id: "integrations", label: "Connections", code: "CNX" },
    { id: "mesh", label: "Mesh", code: "MSH" },
    { id: "npu", label: "NPU Runtime", code: "NPU" },
  ] satisfies NavItemCopy[],
  navSections: [
    { label: "Setup", items: ["onboarding", "settings", "integrations", "tools"] },
    { label: "Operate", items: ["dashboard", "tasks", "agents", "office", "approvals", "sessions"] },
    { label: "Observe", items: ["activity", "system", "memory", "files", "costs", "mesh", "npu", "cron"] },
    { label: "Admin", items: ["skills"] },
  ] satisfies NavSectionCopy[],
  nextStepByTab: {
    onboarding: "Finish the setup checklist, then move to Summit or Forge.",
    dashboard: "Use Quick Actions to jump to approvals, tasks, or live runs.",
    system: "Check vitals first if performance feels slow or unstable.",
    files: "Create or edit an artifact, then review path and risk hints before saving.",
    memory: "Review memory health and run a context compose test if responses drift.",
    agents: "Create or tune roles, then archive agents you no longer use.",
    office: "Pick a desk to inspect what each agent is doing and thinking.",
    activity: "Keep this open while testing actions in another tab.",
    cron: "Verify schedules and recent outcomes before enabling more automation.",
    sessions: "Select a run and inspect timeline details for recent behavior.",
    skills: "Reload skills after adding or updating SKILL.md files.",
    costs: "Check burn rate and switch to a cheaper run mode if needed.",
    settings: "Apply provider and policy changes after reviewing risk indicators.",
    tools: "Grant access by scope, then dry-run risky tools before live execution.",
    approvals: "Resolve pending approvals to unblock agent work.",
    tasks: "Keep task state current and clean stale work with trash/restore.",
    integrations: "Start with the guided form and only use Advanced JSON when needed.",
    mesh: "Validate node status and lease health before distributed execution.",
    npu: "Confirm sidecar status and model readiness before selecting npu-local.",
  } as Record<TabId, string>,
};

export const pageCopy: Record<PageId, PageCopy> = {
  dashboard: {
    title: "Summit",
    subtitle: "High-level health, workload, and spend status across your current operations.",
    guide: {
      what: "Summit gives you a quick operational snapshot so you can decide where to focus first.",
      when: "Open this page first whenever you start a session or return after a break.",
      actions: [
        "Check if approvals are blocking work.",
        "Review task and session pressure.",
        "Jump directly to the page that needs attention.",
      ],
      terms: [
        { term: "Pending approvals", meaning: "Risky actions waiting for your decision." },
        { term: "Active subagents", meaning: "Subagent sessions currently running task work." },
      ],
    },
  },
  system: {
    title: "Engine",
    subtitle: "Runtime health and host vitals for the current GoatCitadel node.",
    guide: {
      what: "Shows machine and process vitals so you can spot bottlenecks quickly.",
      when: "Use this when the system feels slow or unstable.",
      actions: [
        "Check memory and process usage.",
        "Watch CPU and load trends.",
        "Verify host uptime and platform details.",
      ],
    },
  },
  files: {
    title: "Trail Files",
    subtitle: "Create, edit, and manage workspace artifacts inside safe file boundaries.",
    guide: {
      what: "Trail Files is your safe workspace editor for notes, docs, reports, and other artifacts.",
      when: "Use this when you need direct file control without leaving Mission Control.",
      actions: [
        "Create an artifact from a template.",
        "Pick a path from suggestions, then save changes.",
        "Review path and change risk before writing.",
      ],
      terms: [
        { term: "Artifact", meaning: "A useful output file like a report, brief, note, or release doc." },
        { term: "Write jail", meaning: "Allowed folders where file writes are permitted." },
      ],
    },
  },
  memory: {
    title: "Memory Pasture",
    subtitle: "Visibility into memory files, distilled context, and retrieval coverage.",
    guide: {
      what: "Shows what memory is available and how QMD context is being generated.",
      when: "Use this when answers lose context or memory quality drops.",
      actions: [
        "Inspect workspace memory files.",
        "Review QMD stats and recent packs.",
        "Compose a context pack for a test prompt.",
      ],
      terms: [
        { term: "QMD", meaning: "Query-time distilled memory used to keep prompts concise and relevant." },
      ],
    },
  },
  agents: {
    title: "Goat Crew",
    subtitle: "Manage built-in and custom agent profiles used throughout Mission Control.",
    guide: {
      what: "This is your persistent agent roster for long-lived roles and responsibilities.",
      when: "Use this when adding a specialist, updating role descriptions, or cleaning unused roles.",
      actions: [
        "Create custom agent roles.",
        "Edit built-in display fields safely.",
        "Archive or restore roles as your workflow evolves.",
      ],
      terms: [
        { term: "Role ID", meaning: "Stable identity key for a role. Built-in Role IDs are immutable." },
        { term: "Archived", meaning: "Hidden from active views but still recoverable." },
      ],
    },
  },
  office: {
    title: "Herd HQ",
    subtitle: "Live WebGL floor view of what your agents are doing and thinking.",
    guide: {
      what: "Visual operations room for real-time agent activity and triage.",
      when: "Use this for live observability and quick agent-by-agent inspection.",
      actions: [
        "Select an agent station to inspect details.",
        "Review thought/action overlays.",
        "Track active and idle roles at a glance.",
      ],
    },
  },
  activity: {
    title: "Pulse",
    subtitle: "Realtime event stream across gateway, tools, approvals, and workflows.",
    guide: {
      what: "Shows live events so you can verify system behavior while actions run.",
      when: "Use this while testing, debugging, or validating automation.",
      actions: [
        "Perform an action in another tab.",
        "Watch events appear in real time.",
        "Confirm expected order and payloads.",
      ],
    },
  },
  cron: {
    title: "Bell Tower",
    subtitle: "Scheduled jobs and recurring automation status.",
    guide: {
      what: "Lists scheduled jobs with run timing and enabled state.",
      when: "Use this when validating recurring automations.",
      actions: [
        "Review enabled schedules.",
        "Check last and next run times.",
        "Spot jobs that are stale or failing.",
      ],
    },
  },
  sessions: {
    title: "Runs",
    subtitle: "Session health, activity timeline, and spend visibility for active conversations.",
    guide: {
      what: "Summarizes current sessions and lets you inspect each run in detail.",
      when: "Use this to monitor conversation quality and investigate issues.",
      actions: [
        "Filter by health and search.",
        "Select a run from the list.",
        "Inspect summary and timeline details.",
      ],
      terms: [
        { term: "Session", meaning: "A routed conversation keyed by channel/account/peer or room/thread." },
        { term: "Timeline", meaning: "Chronological transcript events for the selected run." },
      ],
    },
  },
  skills: {
    title: "Playbook",
    subtitle: "Loaded skills that shape agent behavior and capability.",
    guide: {
      what: "Shows active skills and dependency health.",
      when: "Use this after adding or changing SKILL.md files.",
      actions: [
        "Review loaded skills.",
        "Check dependency status.",
        "Reload skills when needed.",
      ],
    },
  },
  costs: {
    title: "Feed Ledger",
    subtitle: "Token and cost tracking to keep runs efficient and predictable.",
    guide: {
      what: "Tracks token and dollar usage by day, session, agent, or task.",
      when: "Use this before and during larger runs to control spend.",
      actions: [
        "Choose a scope (day/session/agent/task).",
        "Review hot spots.",
        "Apply run-cheaper recommendations if needed.",
      ],
    },
  },
  settings: {
    title: "Forge",
    subtitle: "Runtime setup for auth, policy posture, budgets, and model providers.",
    guide: {
      what: "Forge controls how GoatCitadel runs, what it can access, and which models it uses.",
      when: "Use this for first-time setup and policy/provider updates.",
      actions: [
        "Set provider and model defaults.",
        "Review auth and allowlist posture.",
        "Apply and verify configuration safely.",
      ],
      terms: [
        { term: "Tool profile", meaning: "Baseline capability set used by policy resolver." },
      ],
    },
  },
  tools: {
    title: "Tool Access",
    subtitle: "Consent-first control over Dev Ops, Knowledge, and Comms tools.",
    guide: {
      what: "Configure tool availability by scope and approval posture.",
      when: "Use this before enabling high-impact actions.",
      actions: [
        "Review tool catalog and risk levels.",
        "Create scoped grants with expiry where needed.",
        "Dry-run risky tool calls first.",
      ],
      terms: [
        { term: "Scope precedence", meaning: "task > agent > session > global." },
      ],
    },
  },
  approvals: {
    title: "Gatehouse",
    subtitle: "Human-in-the-loop decisions for risky operations.",
    guide: {
      what: "Review, approve, or reject actions that require explicit operator confirmation.",
      when: "Use this whenever work is blocked on risk-based approval.",
      actions: [
        "Inspect the action request.",
        "Read explanation and risk context.",
        "Approve or reject with confidence.",
      ],
      terms: [
        { term: "Replay", meaning: "Auditable event timeline for each approval decision." },
      ],
    },
  },
  tasks: {
    title: "Trailboard",
    subtitle: "Structured task execution with activities, deliverables, and subagent sessions.",
    guide: {
      what: "Task hub for planning, execution tracking, and output management.",
      when: "Use this when you want structured delivery over ad-hoc prompting.",
      actions: [
        "Create and prioritize tasks.",
        "Track activity and attach deliverables.",
        "Manage subagent sessions tied to task work.",
      ],
      terms: [
        { term: "Subagent session", meaning: "A linked agent conversation doing part of a task." },
      ],
    },
  },
  integrations: {
    title: "Connections",
    subtitle: "External service connections for channels, providers, and automations.",
    guide: {
      what: "Defines what external systems GoatCitadel can talk to and how.",
      when: "Use this to add, pause, update, or remove integrations.",
      actions: [
        "Select scope and catalog entry.",
        "Use guided fields for setup.",
        "Enable, test, and monitor connection status.",
      ],
      terms: [
        { term: "Catalog", meaning: "Built-in integration definitions with expected config fields." },
      ],
    },
  },
  mesh: {
    title: "Mesh",
    subtitle: "Node membership, lease health, and session ownership across machines.",
    guide: {
      what: "Shows distributed coordination state for multi-node operation.",
      when: "Use this when running GoatCitadel across multiple machines.",
      actions: [
        "Check node status and connectivity.",
        "Verify leadership leases.",
        "Review session ownership and replication offsets.",
      ],
      terms: [
        { term: "Session ownership", meaning: "Single-writer lock for a session across nodes." },
      ],
    },
  },
  npu: {
    title: "NPU Runtime",
    subtitle: "Manage local sidecar inference and acceleration capability status.",
    guide: {
      what: "Controls local NPU sidecar runtime and model availability.",
      when: "Use this when enabling local accelerated inference.",
      actions: [
        "Check sidecar health and capabilities.",
        "Start/stop/refresh runtime.",
        "Verify available models before selecting npu-local.",
      ],
      terms: [
        { term: "Sidecar", meaning: "Local service exposing OpenAI-compatible endpoints for NPU-backed inference." },
      ],
    },
  },
  onboarding: {
    title: "Launch Wizard",
    subtitle: "Guided first-time setup for auth, providers, defaults, and optional mesh.",
    guide: {
      what: "Walks you through a safe initial setup with practical defaults.",
      when: "Use this after install or when resetting your baseline configuration.",
      actions: [
        "Set auth and provider defaults.",
        "Review safety and runtime options.",
        "Apply setup and continue to testing tabs.",
      ],
    },
  },
  liveFeed: {
    title: "Live Feed",
    subtitle: "Raw realtime stream for deep debugging.",
    guide: {
      what: "Displays unfiltered realtime event payloads.",
      when: "Use this when you need exact raw events for debugging.",
      actions: [
        "Trigger an action elsewhere.",
        "Observe raw payloads here.",
        "Compare with processed page views.",
      ],
    },
  },
};
