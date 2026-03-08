import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { UiEffectsMode } from "./effects-mode";

export type UiExperienceMode = "simple" | "advanced";
export type UiDensity = "comfortable" | "default" | "compact";

interface UiPreferencesValue {
  mode: UiExperienceMode;
  setMode: (mode: UiExperienceMode) => void;
  density: UiDensity;
  setDensity: (density: UiDensity) => void;
  effectsMode: UiEffectsMode;
  setEffectsMode: (mode: UiEffectsMode) => void;
  showTechnicalDetails: boolean;
  setShowTechnicalDetails: (enabled: boolean) => void;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (workspaceId: string) => void;
}

const MODE_KEY = "goatcitadel.ui.mode.v1";
const DENSITY_KEY = "goatcitadel.ui.density.v1";
const EFFECTS_MODE_KEY = "goatcitadel.ui.effects_mode.v1";
const DETAILS_KEY = "goatcitadel.ui.technical_details.v1";
const WORKSPACE_KEY = "goatcitadel.ui.workspace_id.v1";

const UiPreferencesContext = createContext<UiPreferencesValue>({
  mode: "simple",
  setMode: () => {},
  density: "default",
  setDensity: () => {},
  effectsMode: "auto",
  setEffectsMode: () => {},
  showTechnicalDetails: false,
  setShowTechnicalDetails: () => {},
  activeWorkspaceId: "default",
  setActiveWorkspaceId: () => {},
});

export function UiPreferencesProvider(props: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiExperienceMode>(() => readModeFromStorage());
  const [density, setDensityState] = useState<UiDensity>(() => readDensityFromStorage());
  const [effectsMode, setEffectsModeState] = useState<UiEffectsMode>(() => readEffectsModeFromStorage());
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
      density,
      setDensity: (nextDensity) => {
        setDensityState(nextDensity);
        writeStorage(DENSITY_KEY, nextDensity);
      },
      effectsMode,
      setEffectsMode: (nextEffectsMode) => {
        setEffectsModeState(nextEffectsMode);
        writeStorage(EFFECTS_MODE_KEY, nextEffectsMode);
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
    [mode, density, effectsMode, showTechnicalDetails, activeWorkspaceId],
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

function readDensityFromStorage(): UiDensity {
  if (typeof window === "undefined") {
    return "default";
  }
  const raw = window.localStorage.getItem(DENSITY_KEY);
  if (raw === "comfortable" || raw === "compact") {
    return raw;
  }
  return "default";
}

function readEffectsModeFromStorage(): UiEffectsMode {
  if (typeof window === "undefined") {
    return "auto";
  }
  const raw = window.localStorage.getItem(EFFECTS_MODE_KEY);
  if (raw === "full" || raw === "reduced") {
    return raw;
  }
  return "auto";
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
