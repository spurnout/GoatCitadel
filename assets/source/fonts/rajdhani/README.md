# Rajdhani Font Source

- Font family: Rajdhani
- Source project: Google Fonts
- Upstream repository: https://github.com/google/fonts/tree/main/ofl/rajdhani
- Upstream CSS reference: https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap
- Author: Indian Type Foundry
- License: SIL Open Font License 1.1
- License file: `OFL.txt`

## Runtime subset

The Mission Control UI ships a local latin-only subset for these weights:

- `rajdhani-latin-500.woff2`
- `rajdhani-latin-600.woff2`
- `rajdhani-latin-700.woff2`

Runtime path:

- `apps/mission-control/public/fonts/rajdhani/`

## Notes

- The local subset replaces the previous remote Google Fonts CSS import.
- Mission Control uses Rajdhani as a display-only font for headings, numerals, and tactical labels; body copy stays on IBM Plex Sans.
