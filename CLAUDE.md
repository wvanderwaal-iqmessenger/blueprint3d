# Blueprint3D — Project Context

## What this project is

A modernized fork of [furnishup/blueprint3d](https://github.com/furnishup/blueprint3d), a 10-year-old jQuery/Three.js floorplan editor. The original was a CommonJS/Grunt project targeting Three.js r68. This fork has been fully modernized and repurposed as the **room-layout editor for a medical alarm system** — used to place medical alarm devices (sensors, call buttons, etc.) in a drawn floor plan and visualize them in 3D.

Modernization work done so far:
- Migrated build system: Grunt + manual bundles → **Vite 8 + TypeScript 6**
- Replaced old Three.js r68 with **Three.js r184** (BufferGeometry, no deprecated APIs)
- Replaced Bootstrap 3 + custom CSS with **Tailwind CSS v4 + Bootstrap Icons**
- Complete UI redesign: Apple-like **glass morphism** interface layered over the 3D scene
- Three.js renderer optimized for FPS: demand-driven render loop (rAF, not setTimeout), dirty flags, pixel-ratio cap at 2×, PCFShadowMap, stats.js overlay
- Floorplanner rewritten: snap pipeline (grid/angle/corner/constraint), DPR-aware canvas, dark-theme visuals, drawing assist HUD

---

## Tech stack

| Layer | Technology |
|---|---|
| Build | Vite 8, TypeScript 6 |
| 3D engine | Three.js r184 |
| UI framework | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Icons | Bootstrap Icons |
| jQuery | v4 (still used by `example/js/example.js` for DOM wiring) |
| FPS overlay | stats.js |
| Unit system | Imperial (inch) / Metric (m/cm/mm) — toggled at runtime, persisted in `localStorage` |

---

## Commands

```bash
npm run dev        # Start dev server (opens browser automatically)
npm run build      # Production build → dist/
npm run preview    # Serve the dist/ build locally
npm run typecheck  # tsc --noEmit (no emit, type errors only)
```

Static assets (3D models, textures, room thumbnails) are served from `example/` via Vite's `publicDir`.

---

## Repository layout

```
src/
  blueprint3d.ts        # Public entry point — exports Blueprint3d class
  main.ts               # Vite entry: instantiates BP3D, exposes window.BP3D
  styles.css            # Tailwind + glass UI utilities + layout primitives
  core/
    configuration.ts    # Runtime config store (wall height, thickness, dim unit)
    dimensioning.ts     # Unit formatting (cmToMeasure) + parsing (measureToCm)
    event-emitter.ts    # Tiny typed EventEmitter used throughout
    utils.ts            # Math/geometry helpers
  floorplanner/
    floorplanner.ts     # 2D canvas controller: input, snap pipeline, constraints
    floorplanner_view.ts# Canvas renderer: grid, walls, corners, labels
  model/
    floorplan.ts        # Data model: walls, corners, rooms, textures
    wall.ts             # Wall entity (start/end corners, textures, thickness)
    corner.ts           # Corner entity (x/y, connected walls)
    room.ts             # Polygon room derived from wall graph
    half_edge.ts        # Directed half-edge (front/back of a wall)
    model.ts            # Top-level model: floorplan + scene
    scene.ts            # Three.js scene wrapper
  items/
    item.ts             # Base class for all placeable 3D items
    wall_item.ts        # Items mounted on walls (e.g. alarm panel)
    in_wall_item.ts     # Items recessed into walls
    floor_item.ts       # Items placed on the floor
    factory.ts          # Deserializes item metadata into concrete item classes
  three/
    main.ts             # Three.js render loop, camera, renderer, stats overlay
    controller.ts       # Mouse/touch interaction for 3D view (pick, drag, rotate)
    controls.ts         # Orbit controls (pan/zoom/rotate camera)
    floorplan.ts        # Three.js geometry builder for the floorplan model
    edge.ts             # Wall face geometry + texture application
    floor.ts            # Floor polygon geometry
    hud.ts              # Rotation handle overlay (HUD scene rendered on top)
    lights.ts           # Ambient + directional lights with shadow maps
    skybox.ts           # Environment background
    legacy-json-loader.ts # Loads old blueprint3d JSON room files

index.html              # Single-page app shell (Tailwind + glass UI)
example/
  js/example.js         # jQuery DOM wiring (modes, sidebar, HUD, unit toggle)
  models/               # GLTF / legacy-JSON 3D furniture models
  rooms/                # Textures for walls and floors
  rooms/thumbnails/     # Preview images for the texture picker
  models/thumbnails/    # Preview images for the item picker
```

---

## Architecture overview

```
window.BP3D (exposed by src/main.ts)
  └── Blueprint3d
        ├── model: Model
        │     ├── floorplan: Floorplan   ← walls/corners/rooms data
        │     └── scene: Scene           ← Three.js scene wrapper
        ├── three: Main                  ← render loop + camera
        │     ├── controller             ← 3D mouse interaction
        │     ├── controls               ← orbit camera
        │     ├── hud                    ← rotation arrow overlay
        │     └── floorplan (Three)      ← geometry built from Floorplan data
        └── floorplanner: Floorplanner   ← 2D canvas editor
              └── FloorplannerView       ← canvas drawing
```

`example/js/example.js` wires the DOM (sidebar, mode buttons, drawing HUD, unit toggle) to `window.BP3D`. It is plain jQuery and intentionally kept separate from the TypeScript library.

---

## Glass UI design system

All UI panels use a consistent glass morphism aesthetic defined in `src/styles.css`.

**Tailwind utilities (defined with `@utility`):**
- `glass-panel` — main frosted-glass card (blur 28px, white 14% bg)
- `glass-pill` — smaller pill/badge variant (blur 24px)
- `glass-button` / `glass-button-hover` — interactive glass button

**CSS classes (not Tailwind utilities):**
- `glass-input` — form inputs inside glass panels
- `scroll-glass` — styled scrollbar for glass panels
- `unit-toggle.is-active` — active state for the Imperial/Metric toggle buttons

**CSS custom properties (set in `@theme`):**
- `--color-accent` — violet (`oklch(62% 0.22 280)`)
- `--color-accent-soft` — softened violet at 50% alpha
- `--color-glass-*`, `--color-ink-*` — surface and text tones

**Layout primitives (in `styles.css`):**
- `#viewer`, `#floorplanner`, `#add-items` are `position: absolute; inset: 0` — toggled visible by JS
- `aside.sidebar` is `position: fixed` with flex-column layout and `overflow: hidden`; inner scroll is on a child div

When adding new UI panels: use `glass-panel` + `rounded-2xl p-4` as a baseline. Put inputs in `glass-input`. Keep text `text-white/70` for labels and `text-white` for values.

---

## Floorplanner drawing system

The 2D floorplanner (`src/floorplanner/floorplanner.ts`) has a layered snap pipeline applied on every mouse move:

1. **Hard constraints** — if the user has typed a length or angle in the HUD, these are applied first from `lastNode`
2. **Corner snap** — cursor within `cornerSnapCm` (25 cm) of an existing corner locks to it
3. **Angle snap** — active when `angleSnap = true` or Shift is held; snaps to 15° increments
4. **Grid snap** — snaps to `gridSizeCm` (default 25 cm) if no constraint is active and not on a corner

Key public API on `Floorplanner`:
- `setConstraintLengthCm(cm | null)` / `setConstraintAngleRad(rad | null)` — lock next wall dimensions
- `commitNextCorner()` — programmatically place a corner (used by "Place ⏎" button and Enter key)
- `setSnapToGrid(bool)` / `setAngleSnap(bool)` / `setGridSizeCm(cm)` — snap settings
- `drawStateCallbacks` — `EventEmitter<(state: DrawState) => void>` fired on every target update; drives the live readout in the HUD
- `refresh()` — force a canvas redraw (call after external state change like unit switch)

Escape behaviour: first press stops the current polyline (`lastNode = null`), second press exits DRAW mode entirely.

---

## Unit / dimensioning system

- Active unit stored in `Configuration` under key `configDimUnit`; values: `dimInch`, `dimMeter`, `dimCentiMeter`, `dimMilliMeter`
- Internal representation is always **centimetres**
- `Dimensioning.cmToMeasure(cm)` — formats a cm value to the active unit string
- `Dimensioning.measureToCm(text)` — parses a user-typed string (handles `4.5m`, `10'6"`, `6in`, bare numbers) back to cm
- Unit toggle in the sidebar calls `BP3D.Configuration.setValue(BP3D.configDimUnit, unit)`, then `blueprint3d.floorplanner.refresh()` to repaint labels
- User preference persisted in `localStorage` under key `bp3d:unit`

---

## Three.js render loop (FPS optimization)

The renderer (`src/three/main.ts`) only calls `renderer.render()` when something has changed:

- `needsUpdateFlag` — set by `needsUpdate()`, cleared after render
- `controls.needsUpdate` — set by the orbit controls on camera movement
- `controller.needsUpdate` — set by item drag/selection
- `model.scene.needsUpdate` — set when scene geometry changes

The animation loop itself runs at display refresh rate via `requestAnimationFrame` (replaced the original `setTimeout(50ms)` which capped at ~20 FPS). Pixel ratio is capped at 2× to avoid 9× pixel cost on 3× HiDPI screens. `stats.js` is attached to the top-right of the 3D view and can be clicked to toggle between FPS and MS panels.

---

## Conventions

- All coordinates in **centimetres** internally; only format on display
- No `any` unless interfacing with legacy jQuery code in `example.js`
- No comments unless the *why* is non-obvious — well-named identifiers are preferred
- `EventEmitter<T>` (from `src/core/event-emitter.ts`) for all internal callbacks — not DOM events
- The `example/js/example.js` file is intentionally plain ES5-style jQuery; it is not TypeScript and not bundled — keep it that way
- `window.BP3D` is the bridge between the TypeScript library and `example.js`; add new public APIs there in `src/main.ts` when `example.js` needs them
