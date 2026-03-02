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
    title: "Quick Guide",
    what: "What you can do here",
    when: "Best time to use this page",
    actions: "Try this first",
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
  brandSubtitle: "Your AI operations home base",
  quickActionsButton: "Quick Actions (Ctrl/Cmd+K)",
  nextStepTitle: "Start Here",
  streamBanner: "Live updates are {state}. GoatCitadel will reconnect automatically.",
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
    { id: "chat", label: "Chat Workspace", code: "CHT" },
    { id: "promptLab", label: "Prompt Lab", code: "LAB" },
    { id: "improvement", label: "Improvement", code: "IMP" },
    { id: "skills", label: "Playbook (Skills)", code: "SKL" },
    { id: "costs", label: "Feed Ledger (Costs)", code: "USD" },
    { id: "settings", label: "Forge (Settings)", code: "CFG" },
    { id: "tools", label: "Tool Access", code: "TLS" },
    { id: "approvals", label: "Gatehouse (Approvals)", code: "APR" },
    { id: "tasks", label: "Trailboard (Tasks)", code: "TSK" },
    { id: "integrations", label: "Connections", code: "CNX" },
    { id: "mcp", label: "MCP Servers", code: "MCP" },
    { id: "mesh", label: "Mesh", code: "MSH" },
    { id: "npu", label: "NPU Runtime", code: "NPU" },
  ] satisfies NavItemCopy[],
  navSections: [
    { label: "Setup", items: ["onboarding", "settings", "integrations", "tools"] },
    { label: "Operate", items: ["dashboard", "chat", "promptLab", "improvement", "tasks", "agents", "office", "approvals", "sessions"] },
    { label: "Observe", items: ["activity", "system", "memory", "files", "costs", "mesh", "npu", "cron"] },
    { label: "Admin", items: ["skills", "mcp"] },
  ] satisfies NavSectionCopy[],
  nextStepByTab: {
    onboarding: "Finish setup once, then move into Summit or Chat.",
    dashboard: "Start here for a quick health check, then jump where work is blocked.",
    system: "If anything feels slow, check vitals here first.",
    files: "Create or update a file, then review path and risk hints before saving.",
    memory: "Use this when replies feel off-context or forgetful.",
    agents: "Tune your crew roles so each agent has a clear job.",
    office: "Pick an agent station to see what it is doing right now.",
    activity: "Keep this open while you test actions in other tabs.",
    cron: "Review scheduled jobs and confirm recent runs look healthy.",
    sessions: "Choose a run and inspect timeline, usage, and outcomes.",
    chat: "Pick a project, open a session, and send a message.",
    promptLab: "Run your test pack, then score quality and reliability.",
    improvement: "Review weekly replay findings, then apply or revert low-risk tunes.",
    skills: "Decide which skills are always on, guarded, or off.",
    costs: "Watch spend and switch to a lighter mode when needed.",
    settings: "Update providers and safety defaults in one place.",
    tools: "Grant only what you need, then dry-run before going live.",
    approvals: "Approve or reject risky actions waiting on you.",
    tasks: "Keep tasks organized and archive stale work as you go.",
    integrations: "Use guided setup first, then advanced JSON only if needed.",
    mcp: "Connect MCP servers, set trust level, then test safely.",
    mesh: "Check multi-node health before running distributed work.",
    npu: "Verify local runtime readiness before selecting npu-local models.",
  } as Record<TabId, string>,
};

export const pageCopy: Record<PageId, PageCopy> = {
  dashboard: {
    title: "Summit",
    subtitle: "A quick snapshot of system health, workload, and spend.",
    guide: {
      what: "Summit helps you quickly see what needs your attention.",
      when: "Open this first when you start your day or come back after a break.",
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
    subtitle: "Machine and runtime health for this GoatCitadel node.",
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
    subtitle: "Create and edit workspace files inside safe write limits.",
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
    subtitle: "See what memory exists and how it is being used in replies.",
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
    subtitle: "Manage built-in and custom agent roles for your workflows.",
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
    subtitle: "Live floor view of what your agents are doing right now.",
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
    subtitle: "Live event stream across gateway, tools, approvals, and workflows.",
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
    subtitle: "Scheduled jobs and recurring automation health.",
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
    subtitle: "Session health, activity timeline, and spend for active conversations.",
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
  chat: {
    title: "Chat Workspace",
    subtitle: "Your everyday chat hub for projects, files, and agent help.",
    guide: {
      what: "This is your daily chat surface for both mission and external sessions.",
      when: "Use this when you want a smooth chat flow with tool and safety controls.",
      actions: [
        "Create or select a project.",
        "Switch between sessions from the sidebar.",
        "Send messages with optional file attachments.",
      ],
      terms: [
        { term: "Mission session", meaning: "A local GoatCitadel chat session using configured model providers." },
        { term: "External session", meaning: "A routed chat that can write back to an integration target." },
        { term: "Writeback binding", meaning: "Connection + target mapping required before posting to external sessions." },
      ],
    },
  },
  promptLab: {
    title: "Prompt Lab",
    subtitle: "Run prompt tests, spot weak replies quickly, and track quality over time.",
    guide: {
      what: "Prompt Lab lets you test changes quickly before bigger runs.",
      when: "Use this when tuning models, tools, or prompt policies against a fixed test set.",
      actions: [
        "Import markdown prompt packs with [TEST-##] blocks.",
        "Run one test, run next, or batch-run all tests.",
        "Score each run on the 0-2 rubric and review pass/fail clusters.",
      ],
      terms: [
        { term: "Pass threshold", meaning: "Default pass threshold is 7/10 total score." },
        { term: "Run trace", meaning: "Per-test execution trace including routing and tool behavior." },
      ],
    },
  },
  improvement: {
    title: "Improvement",
    subtitle: "Weekly decision replay audit for long-term agent quality and safe auto-tuning.",
    guide: {
      what: "Replays last week's chat/tool decisions, scores likely misses, and clusters root causes.",
      when: "Use this weekly (or after major changes) to keep behavior improving without guessing.",
      actions: [
        "Run replay manually if you shipped major runtime changes.",
        "Review top clusters and compare trend changes versus last week.",
        "Revert any low-risk auto-tune instantly if behavior regresses.",
      ],
      terms: [
        { term: "Likely wrong", meaning: "A replay item with high wrongness probability after rule + model scoring." },
        { term: "Duplicate suppressed", meaning: "Repeated finding fingerprint from prior reports, hidden from top list." },
      ],
    },
  },
  skills: {
    title: "Playbook",
    subtitle: "Choose which skills are active, guarded (sleep), or fully off.",
    guide: {
      what: "Manage runtime skill posture so activation stays useful without burning tokens.",
      when: "Use this when testing prompt packs, reducing noise, or hardening automation.",
      actions: [
        "Reload skills after adding or editing SKILL.md files.",
        "Set each skill to enabled, sleep, or disabled.",
        "Tune guarded-auto threshold and first-use confirmation behavior.",
      ],
      terms: [
        { term: "Sleep", meaning: "Skill is auto-eligible only when confidence is high enough." },
        { term: "Guarded auto threshold", meaning: "Minimum confidence required before a sleep skill auto-activates." },
      ],
    },
  },
  costs: {
    title: "Feed Ledger",
    subtitle: "Track token usage and cost so runs stay predictable.",
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
    subtitle: "Set up auth, safety defaults, budgets, and model providers.",
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
    subtitle: "Decide which tools can run, where, and with what approval level.",
    guide: {
      what: "Control tool access by scope and approval rules.",
      when: "Use this before enabling higher-risk actions.",
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
    subtitle: "Review and approve risky actions before they run.",
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
    subtitle: "Track tasks, activity, deliverables, and linked subagent sessions.",
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
    subtitle: "Connect external channels, providers, and automation services.",
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
  mcp: {
    title: "MCP Servers",
    subtitle: "Register local or remote MCP servers with trust and safety controls.",
    guide: {
      what: "Control Model Context Protocol servers with explicit trust tiers and per-server tool policy.",
      when: "Use this before enabling external MCP tooling in chat or task workflows.",
      actions: [
        "Register a server (stdio, HTTP, or SSE).",
        "Connect/disconnect and confirm trust/cost posture.",
        "Set redaction and allow/block patterns before live invocation.",
      ],
      terms: [
        { term: "MCP Server", meaning: "A process or endpoint exposing tools/resources over MCP." },
        { term: "OAuth", meaning: "Token-based auth flow for remote MCP services." },
        { term: "Trust tier", meaning: "Trusted, restricted, or quarantined execution posture." },
      ],
    },
  },
  mesh: {
    title: "Mesh",
    subtitle: "Multi-node status, lease health, and session ownership.",
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
    subtitle: "Manage local sidecar inference and acceleration readiness.",
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
      what: "Walks you through a safe setup with practical defaults.",
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
    subtitle: "Raw realtime stream for deep debugging and event validation.",
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
