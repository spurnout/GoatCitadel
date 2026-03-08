# Animated Goat Subagent Source Notes

This folder holds source notes and upstream files for the repo-shipped animated GoatCitadel office goat asset.

Intended runtime asset:
- `apps/mission-control/public/assets/office/models/goat-subagent-animated.glb`

Source asset:
- `Animated Goat: 2 Texture Variants (Free Asset)`
- Source page: https://skfb.ly/pGW7u
- License: CC BY 4.0
- License URL: http://creativecommons.org/licenses/by/4.0/

Pipeline notes:
- Keep raw download archives and intermediate FBX/GLTF files here, not under `public/`.
- Normalize scale and forward axis in Blender before final export.
- Export the runtime asset as `goat-subagent-animated.glb`.
- Preserve stable clip names so Office V5 can map activity states to animation clips.
- Office V5 prefers `goat-subagent-animated.glb` and falls back to `goat-subagent.glb` only when the animated runtime asset is unavailable.

Verification notes:
- Source page verified on 2026-03-07.
- The official Sketchfab page confirms CC BY 4.0, 13.1k triangles, GLTF/FBX formats, and a looping idle animation.
- Runtime GLB imported on 2026-03-07 at `apps/mission-control/public/assets/office/models/goat-subagent-animated.glb`.
- Verified clip names in the GLB JSON chunk:
  - `DeformationSystem|IDLE_01_LOOP`
  - `DeformationSystem|IDLE_02_LOOP`
  - `DeformationSystem.001|IDLE_01_LOOP`
  - `DeformationSystem.001|IDLE_02_LOOP`
