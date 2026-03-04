import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type UiExperienceMode = "simple" | "advanced";

interface UiPreferencesValue {
  mode: UiExperienceMode;
  setMode: (mode: UiExperienceMode) => void;
  showTechnicalDetails: boolean;
  setShowTechnicalDetails: (enabled: boolean) => void;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (workspaceId: string) => void;
}

const MODE_KEY = "goatcitadel.ui.mode.v1";
const DETAILS_KEY = "goatcitadel.ui.technical_details.v1";
const WORKSPACE_KEY = "goatcitadel.ui.workspace_id.v1";

const UiPreferencesContext = createContext<UiPreferencesValue>({
  mode: "simple",
  setMode: () => {},
  showTechnicalDetails: false,
  setShowTechnicalDetails: () => {},
  activeWorkspaceId: "default",
  setActiveWorkspaceId: () => {},
});

export function UiPreferencesProvider(props: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiExperienceMode>(() => readModeFromStorage());
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState<boolean>(() => readDetailsFromStorage());
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(() => readWorkspaceIdFromStorage());

  const value = useMemo<UiPreferencesValue>(
    () => ({
      mode,
      setMode: (nextMode) => {
        setModeState(nextMode);
        writeStorage(MODE_KEY, nextMode);
        const nextShowDetails = nextMode === "advanced";
        setShowTechnicalDetailsState(nextShowDetails);
        writeStorage(DETAILS_KEY, String(nextShowDetails));
      },
      showTechnicalDetails,
      setShowTechnicalDetails: (enabled) => {
        setShowTechnicalDetailsState(enabled);
        writeStorage(DETAILS_KEY, String(enabled));
      },
      activeWorkspaceId,
      setActiveWorkspaceId: (workspaceId) => {
        const normalized = normalizeWorkspaceId(workspaceId);
        setActiveWorkspaceIdState(normalized);
        writeStorage(WORKSPACE_KEY, normalized);
      },
    }),
    [mode, showTechnicalDetails, activeWorkspaceId],
  );

  return (
    <UiPreferencesContext.Provider value={value}>
      {props.children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences(): UiPreferencesValue {
  return useContext(UiPreferencesContext);
}

function readModeFromStorage(): UiExperienceMode {
  if (typeof window === "undefined") {
    return "simple";
  }
  const raw = window.localStorage.getItem(MODE_KEY);
  return raw === "advanced" ? "advanced" : "simple";
}

function readDetailsFromStorage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const raw = window.localStorage.getItem(DETAILS_KEY);
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  const mode = readModeFromStorage();
  return mode === "advanced";
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, value);
}

function readWorkspaceIdFromStorage(): string {
  if (typeof window === "undefined") {
    return "default";
  }
  return normalizeWorkspaceId(window.localStorage.getItem(WORKSPACE_KEY));
}

function normalizeWorkspaceId(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "default";
  }
  return /^[a-zA-Z0-9._-]{1,80}$/.test(trimmed) ? trimmed : "default";
}
