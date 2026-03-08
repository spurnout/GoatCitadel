# Central Operator Source Notes

This folder tracks the source provenance for the shipped Mission Control operator model.

## Source Asset

- Pack: `Universal Base Characters[Standard]`
- Source page: https://quaternius.itch.io/universal-base-characters
- Author: Quaternius
- License: CC0
- Upstream archive is not tracked in git. Re-download from the source page above if the original pack is needed again.

## Selected Runtime Source

- Chosen source file: `assets/source/office/central-operator/runtime-source-male/Superhero_Male_FullBody.gltf`
- Supporting source files:
  - `Superhero_Male_FullBody.bin`
  - `T_Superhero_Male_Dark.png`
  - `T_Superhero_Male_Normal.png`
  - `T_Superhero_Male_Roughness.png`
  - `T_Eye_Brown.png`
  - `T_Eye_Normal_png.png`
  - `T_Hair_1_BaseColor.png`
  - `T_Hair_1_Normal_png.png`

## Shipped Runtime Output

- Runtime asset: `apps/mission-control/public/assets/office/models/central-operator.glb`
- Export target: binary GLB with embedded textures

## Notes

- The current shipped operator uses a body-only male base character from the Quaternius pack for the central Goatherder station.
- The retained `runtime-source-male` subset is the canonical source reference for the shipped runtime model.
- Future polish passes can swap the operator variant or merge additional accessories, but the current runtime path is considered production-safe and policy-compliant.
