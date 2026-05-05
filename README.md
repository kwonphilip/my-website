# Philip Kwon — Personal Website

A personal website featuring two interactive 3D globe visualizations built with React and Three.js.

## Tech Stack

- **React 19.2** with React Compiler (via Babel)
- **Vite 8** — dev server and build tooling
- **Three.js 0.183** — 3D rendering
- **topojson-client / world-atlas** — geographic data

## Getting Started

```bash
npm install
npm run dev      # Start dev server with HMR
npm run build    # Production build (tsc + vite build)
npm run lint     # ESLint check
npm run preview  # Preview production build locally
```

## Architecture

### Two Globe Modes

**`WireframeEarth.jsx`** — Standard globe with coastlines, hex-grid dots, animated flight lanes, city bar charts, and pulsing location pings. Uses a selective bloom pipeline (two `EffectComposer` passes: full scene + bloom-excluded layer).

**`HoloEarth.jsx`** — Holographic elevation-dot globe. Elevation dots are built async from a terrain image (`src/utils/imageUtils.js`), with multiple color modes defined in `src/components/HoloEarth/colorModes.js`.

### Scene Assembly

Each globe's scene is assembled by calling builder functions rather than constructing geometry inline:

| File | Purpose |
|---|---|
| `src/builders/buildShippingLanes.js` | GPU-driven animated flight trails + OBJ airplane models |
| `src/builders/buildCityBuildings.js` | Tiered cuboid city bars by population |
| `src/builders/buildPingsAndBrackets.js` | Pulsing rings + hover brackets at nav locations |
| `src/builders/buildISSTracker.js` | ISS orbit tracker |
| `src/components/WireframeEarth/buildGlobeScene.js` | Assembles the WireframeEarth scene |

All dynamic effects (trails, pings, ring expansions) are driven by shader `time` uniforms updated in the animation loop.

### State & Interactivity

`App.jsx` owns all cross-globe state (zoom, active nav link, globe mode, mobile breakpoint at 900px). Globe components expose methods (`rotateTo`, `setZoom`, `showBracket`, `hideBracket`) via `useImperativeHandle`.

Drag-rotate logic (mouse + touch, with 2s idle auto-spin resumption) lives in `src/hooks/globeDrag.js` and is shared by both globes.

### Geographic Data Pipeline

`src/utils/geo.js` handles lat/lon ↔ Three.js `Vector3` conversion, land-mask texture generation, and topojson feature processing. The dot and flight shaders sample the land mask to clip rendering to landmasses.

### Key Data Files

| File | Contents |
|---|---|
| `src/data/navConfig.js` | Navigation links with target lat/lon |
| `src/data/cities.js` | ~40 cities with populations + tier clustering |
| `src/data/routes.js` | 20 shipping/flight routes |
| `src/data/siteContent.js` | Site copy and content |
| `src/constants.js` | App-wide shared constants |

---

## Credits

### 3D Models

- Airplane by Poly by Google [CC-BY](https://creativecommons.org/licenses/by/3.0/) via [Poly Pizza](https://poly.pizza/m/fzIXe2paBN9)
- Skyscraper by Jarlan Perez [CC-BY](https://creativecommons.org/licenses/by/3.0/) via [Poly Pizza](https://poly.pizza/m/7WF09z31G_v)
- Low Building by Kenney (CC0) via [Poly Pizza](https://poly.pizza/m/dYEbYdPfJr)
- Skyscraper by Kenney (CC0) via [Poly Pizza](https://poly.pizza/m/obYD8hWLTZ)
- International Space Station by Poly by Google [CC-BY](https://creativecommons.org/licenses/by/3.0/) via [Poly Pizza](https://poly.pizza/m/d3Fq5H6ne8E)
- Snowman by Carlos Sanchez Witt [CC-BY](https://creativecommons.org/licenses/by/3.0/) via [Poly Pizza](https://poly.pizza/m/cKYkfU3kdWC)

### Icons

- [Hologram icons](https://www.flaticon.com/free-icons/hologram) by Freepik - Flaticon
- [World icons](https://www.flaticon.com/free-icons/world) by turkkub - Flaticon
- [Travel icons](https://www.flaticon.com/free-icons/travel) by juicy_fish - Flaticon
- [City icons](https://www.flaticon.com/free-icons/city) by Freepik - Flaticon
- [Rotate icons](https://www.flaticon.com/free-icons/rotate) by meaicon - Flaticon
- [Global icons](https://www.flaticon.com/free-icons/global) by Freepik - Flaticon
- [Park icons](https://www.flaticon.com/free-icons/park) by Freepik - Flaticon
- [Satelite icons](https://www.flaticon.com/free-icons/satelite) by Prosymbols Premium - Flaticon
