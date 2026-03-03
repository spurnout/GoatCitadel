import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1", "bld", ".ts.net"];

export function resolveViteAllowedHosts(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.GOATCITADEL_VITE_ALLOWED_HOSTS?.trim();
  if (!raw) {
    return [...DEFAULT_ALLOWED_HOSTS];
  }
  const fromEnv = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const merged = new Set<string>([...DEFAULT_ALLOWED_HOSTS, ...fromEnv]);
  return [...merged];
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Keep Tailnet/MagicDNS support while preserving explicit host checks.
    allowedHosts: resolveViteAllowedHosts(),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");
          if (!normalized.includes("/node_modules/")) {
            return undefined;
          }

          if (normalized.includes("/node_modules/@react-three/fiber/")) {
            return "vendor-r3f";
          }
          if (normalized.includes("/node_modules/@react-three/drei/")) {
            return "vendor-drei";
          }
          if (normalized.includes("/node_modules/three-stdlib/")) {
            return "vendor-three-stdlib";
          }
          if (normalized.includes("/node_modules/three/examples/")) {
            return "vendor-three-examples";
          }
          if (normalized.includes("/node_modules/three/src/")) {
            if (normalized.includes("/src/renderers/")) {
              return "vendor-three-renderers";
            }
            if (normalized.includes("/src/geometries/")) {
              return "vendor-three-geometries";
            }
            if (normalized.includes("/src/materials/")) {
              return "vendor-three-materials";
            }
            if (normalized.includes("/src/textures/")) {
              return "vendor-three-textures";
            }
            if (normalized.includes("/src/loaders/")) {
              return "vendor-three-loaders";
            }
            if (normalized.includes("/src/math/")) {
              return "vendor-three-math";
            }
            if (normalized.includes("/src/animation/")) {
              return "vendor-three-animation";
            }
            if (normalized.includes("/src/core/")) {
              return "vendor-three-base";
            }
            return "vendor-three-core";
          }
          if (normalized.includes("/node_modules/three/build/")) {
            return "vendor-three-build";
          }
          return undefined;
        },
      },
    },
  },
});
