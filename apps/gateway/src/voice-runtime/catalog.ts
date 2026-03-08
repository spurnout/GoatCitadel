import type {
  VoiceModelCatalogEntry,
  VoiceRuntimeReadiness,
} from "@goatcitadel/contracts";

export type ManagedVoicePlatform =
  | "windows-x64"
  | "windows-arm64"
  | "darwin-x64"
  | "darwin-arm64"
  | "linux-x64";
export type ManagedVoiceArchiveKind = "zip" | "tar.gz" | "gz";

export interface ManagedWhisperRuntimeSource {
  platform: ManagedVoicePlatform;
  archiveKind: ManagedVoiceArchiveKind;
  version: string;
  url: string;
  sha256: string;
  installMethod: "download-binary" | "build-from-source";
  binaryRelativePath?: string;
}

export interface ManagedVoiceModelSource extends VoiceModelCatalogEntry {
  url: string;
  sha256: string;
  fileName: string;
}

export interface ManagedFfmpegSource {
  platform: ManagedVoicePlatform;
  archiveKind: Extract<ManagedVoiceArchiveKind, "gz">;
  version: string;
  url: string;
  sha256: string;
  binaryFileName: string;
}

export const WHISPER_RUNTIME_VERSION = "v1.8.3";
export const FFMPEG_HELPER_VERSION = "eugeneware/ffmpeg-static@b6.1.1";
export const WHISPER_SOURCE_TARBALL = {
  version: WHISPER_RUNTIME_VERSION,
  url: `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_RUNTIME_VERSION}.tar.gz`,
  sha256: "c6ca89a5ed05b959d2935e65cd4a8c325ab537e598dc7e7d8aa6572794571885",
};
const WINDOWS_WHISPER_RUNTIME_SOURCE = {
  archiveKind: "zip",
  version: WHISPER_RUNTIME_VERSION,
  url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip",
  sha256: "d824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d",
  installMethod: "download-binary",
  binaryRelativePath: "Release/whisper-cli.exe",
} as const satisfies Omit<ManagedWhisperRuntimeSource, "platform">;

export const MANAGED_WHISPER_RUNTIME_SOURCES: Record<ManagedVoicePlatform, ManagedWhisperRuntimeSource> = {
  "windows-x64": {
    platform: "windows-x64",
    ...WINDOWS_WHISPER_RUNTIME_SOURCE,
  },
  "windows-arm64": {
    platform: "windows-arm64",
    ...WINDOWS_WHISPER_RUNTIME_SOURCE,
  },
  "darwin-x64": {
    platform: "darwin-x64",
    archiveKind: "tar.gz",
    version: WHISPER_RUNTIME_VERSION,
    url: WHISPER_SOURCE_TARBALL.url,
    sha256: WHISPER_SOURCE_TARBALL.sha256,
    installMethod: "build-from-source",
  },
  "darwin-arm64": {
    platform: "darwin-arm64",
    archiveKind: "tar.gz",
    version: WHISPER_RUNTIME_VERSION,
    url: WHISPER_SOURCE_TARBALL.url,
    sha256: WHISPER_SOURCE_TARBALL.sha256,
    installMethod: "build-from-source",
  },
  "linux-x64": {
    platform: "linux-x64",
    archiveKind: "tar.gz",
    version: WHISPER_RUNTIME_VERSION,
    url: WHISPER_SOURCE_TARBALL.url,
    sha256: WHISPER_SOURCE_TARBALL.sha256,
    installMethod: "build-from-source",
  },
};

export const MANAGED_FFMPEG_SOURCES: Record<ManagedVoicePlatform, ManagedFfmpegSource> = {
  "windows-x64": {
    platform: "windows-x64",
    archiveKind: "gz",
    version: FFMPEG_HELPER_VERSION,
    url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz",
    sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
    binaryFileName: "ffmpeg.exe",
  },
  "windows-arm64": {
    platform: "windows-arm64",
    archiveKind: "gz",
    version: FFMPEG_HELPER_VERSION,
    url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz",
    sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
    binaryFileName: "ffmpeg.exe",
  },
  "darwin-x64": {
    platform: "darwin-x64",
    archiveKind: "gz",
    version: FFMPEG_HELPER_VERSION,
    url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64.gz",
    sha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106",
    binaryFileName: "ffmpeg",
  },
  "darwin-arm64": {
    platform: "darwin-arm64",
    archiveKind: "gz",
    version: FFMPEG_HELPER_VERSION,
    url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64.gz",
    sha256: "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa",
    binaryFileName: "ffmpeg",
  },
  "linux-x64": {
    platform: "linux-x64",
    archiveKind: "gz",
    version: FFMPEG_HELPER_VERSION,
    url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz",
    sha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
    binaryFileName: "ffmpeg",
  },
};

export const MANAGED_VOICE_MODELS: ManagedVoiceModelSource[] = [
  {
    id: "tiny.en",
    label: "Tiny English",
    languageScope: "english",
    approxSizeLabel: "74 MB",
    sizeBytes: 77704715,
    recommended: false,
    defaultInstall: false,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    sha256: "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
    fileName: "ggml-tiny.en.bin",
  },
  {
    id: "base.en",
    label: "Base English",
    languageScope: "english",
    approxSizeLabel: "141 MB",
    sizeBytes: 147964211,
    recommended: true,
    defaultInstall: true,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
    fileName: "ggml-base.en.bin",
  },
  {
    id: "small.en",
    label: "Small English",
    languageScope: "english",
    approxSizeLabel: "465 MB",
    sizeBytes: 487614201,
    recommended: false,
    defaultInstall: false,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
    sha256: "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
    fileName: "ggml-small.en.bin",
  },
  {
    id: "tiny",
    label: "Tiny Multilingual",
    languageScope: "multilingual",
    approxSizeLabel: "74 MB",
    sizeBytes: 77691713,
    recommended: false,
    defaultInstall: false,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    fileName: "ggml-tiny.bin",
  },
  {
    id: "base",
    label: "Base Multilingual",
    languageScope: "multilingual",
    approxSizeLabel: "141 MB",
    sizeBytes: 147951465,
    recommended: false,
    defaultInstall: false,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    fileName: "ggml-base.bin",
  },
  {
    id: "small",
    label: "Small Multilingual",
    languageScope: "multilingual",
    approxSizeLabel: "465 MB",
    sizeBytes: 487601967,
    recommended: false,
    defaultInstall: false,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    fileName: "ggml-small.bin",
  },
];

export const DEFAULT_MANAGED_VOICE_MODEL_ID = "base.en";

export function listManagedVoiceModels(): VoiceModelCatalogEntry[] {
  return MANAGED_VOICE_MODELS.map(({ url: _url, sha256: _sha256, fileName: _fileName, ...item }) => item);
}

export function getManagedVoiceModel(modelId: string): ManagedVoiceModelSource | undefined {
  return MANAGED_VOICE_MODELS.find((item) => item.id === modelId);
}

export function getManagedVoiceRuntimeSource(platform: ManagedVoicePlatform): ManagedWhisperRuntimeSource {
  return MANAGED_WHISPER_RUNTIME_SOURCES[platform];
}

export function getManagedFfmpegSource(platform: ManagedVoicePlatform): ManagedFfmpegSource {
  return MANAGED_FFMPEG_SOURCES[platform];
}

export function formatVoiceReadiness(binaryReady: boolean, modelReady: boolean): VoiceRuntimeReadiness {
  if (binaryReady && modelReady) {
    return "ready";
  }
  return binaryReady ? "broken" : "missing";
}
