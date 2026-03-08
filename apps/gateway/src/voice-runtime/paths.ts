import os from "node:os";
import path from "node:path";
import type { ManagedVoicePlatform } from "./catalog.js";

const PREFERRED_HOME_NAME = ".GoatCitadel";
const LEGACY_HOME_NAME = ".goatcitadel";

export interface VoiceRuntimePaths {
  goatHome: string;
  toolsDir: string;
  voiceDir: string;
  whisperDir: string;
  modelsDir: string;
  ffmpegDir: string;
  manifestPath: string;
}

export function resolveGoatCitadelHome(): string {
  const envHome = process.env.GOATCITADEL_HOME?.trim();
  if (envHome) {
    return path.resolve(envHome);
  }
  const preferred = path.join(os.homedir(), PREFERRED_HOME_NAME);
  const legacy = path.join(os.homedir(), LEGACY_HOME_NAME);
  return preferred;
}

export function resolveVoiceRuntimePaths(): VoiceRuntimePaths {
  const goatHome = resolveGoatCitadelHome();
  const toolsDir = path.join(goatHome, "tools");
  const voiceDir = path.join(toolsDir, "voice");
  return {
    goatHome,
    toolsDir,
    voiceDir,
    whisperDir: path.join(voiceDir, "whispercpp"),
    modelsDir: path.join(voiceDir, "models"),
    ffmpegDir: path.join(voiceDir, "ffmpeg"),
    manifestPath: path.join(voiceDir, "manifest.json"),
  };
}

export function detectManagedVoicePlatform(): ManagedVoicePlatform | null {
  if (process.platform === "win32" && process.arch === "x64") {
    return "windows-x64";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "darwin-x64";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64";
  }
  return null;
}
