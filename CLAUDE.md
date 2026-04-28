# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server with HMR
npm run build    # Production build (runs tsc + vite build)
npm run lint     # ESLint check
npm run preview  # Preview production build locally
```

## Architecture

This is a React + Three.js personal website featuring two interactive 3D globe visualizations.

**Tech stack**: React 19.2, Vite 8, Three.js 0.183, topojson-client, world-atlas. The React Compiler is enabled via Babel in `vite.config.js`.

### Two Globe Components

**`WireframeEarth.jsx`** — Standard globe with coastlines, hex-grid dots, animated flight lanes, city bar charts, and pulsing pings. Uses a selective bloom pipeline (two `EffectComposer` passes: one for the full scene, one for bloom-excluded objects on layer 1).

**`HoloEarth.jsx`** — Holographic elevation-dot globe. Elevation dots are built async from a terrain image (`src/utils/imageUtils.js`) so the component renders a loading state first. Supports multiple color modes defined in `src/components/HoloEarth/colorModes.js`.

### Scene Assembly Pattern

Each globe's Three.js scene is built by calling builder functions rather than constructing geometry inline:

- `src/builders/buildShippingLanes.js` — GPU-driven animated flight trails + OBJ airplane models
- `src/builders/buildCityBuildings.js` — Tiered cuboid city bars by population
- `src/builders/buildPingsAndBrackets.js` — Pulsing rings + hover brackets at nav locations
- `src/components/WireframeEarth/buildGlobeScene.js` — Assembles the WireframeEarth scene from builders

All dynamic effects (trails, pings, ring expansions) are driven by shader `time` uniforms updated in the animation loop rather than by rebuilding geometry.

### State & Interactivity

`App.jsx` owns all cross-globe state (zoom, active nav link, globe mode, mobile breakpoint at 900px). It communicates with globe components via `useImperativeHandle` refs that expose methods like `rotateTo`, `setZoom`, `showBracket`, and `hideBracket`.

The shared drag-rotate logic (mouse + touch, with 2s idle auto-spin resumption) lives in `src/hooks/globeDrag.js` and is used by both globes.

### Geographic Data Pipeline

`src/utils/geo.js` handles lat/lon ↔ Three.js `Vector3` conversion, land-mask texture generation (used by the dot shaders to hide ocean dots), and topojson feature processing. Coastline data comes from `world-atlas`. The dot/flight shaders sample this land mask to clip rendering to landmasses.

### Data Files

- `src/data/navConfig.js` — Navigation links with target lat/lon and detail-level mapping
- `src/data/cities.js` — ~40 cities with populations + tier clustering
- `src/data/routes.js` — 20 shipping/flight routes; routes are adjusted for HoloEarth's projection
- `src/constants.js` — App-wide shared constants

### Assets

- `src/assets/textures/` — Globe surface, normal, specular textures
- `src/assets/models/` — OBJ airplane models for flight lanes
- `src/assets/characters/`, `src/assets/icons/`, `src/assets/misc/` — UI assets
