# Detail modules

The land and its people are filled in by small modules that all plug into the page the same way. `src/main.js` lists them in `DETAIL_MODULES` and loads each one after the city, the temples and the people are built. A module that is missing or throws is left out with a console warning; everything else still builds.

| Module | What it adds |
|---|---|
| `src/props.js` | Things in the streets and on the roofs of the city |
| `src/trades.js` | People at work, with the tools and goods of their trade |
| `src/fauna.js` | Birds and other animals, and things the wind moves |
| `src/flora.js` | Crops, grass, flowers and field walls close to the viewer |

## The interface

```js
// src/<name>.js
export function build(mats, ctx) {
  return {
    layer: 'city',            // which Layers checkbox hides it: 'city' or 'life' (default 'city')
    groups: [                 // added to the scene; shown by period and layer
      { group, periods: ['late'], layer: 'life' },   // periods: any of 'early', 'late', 'ruin'; leave out for all
    ],
    update(time, dt, env) {}, // every frame
    lights: [],               // { pos, power, range, lamp, nightOnly, periods } for the shared pool of point lights
    fireMeshes: [],           // flame sprites made with mats.fire; userData { base, phase } makes them flicker
    labels: [],               // { label, pos, periods, info, far }
    info: {},                 // info cards, as in INFO in data.js: { id: { mode, title, he, dims, refs, note } }
    zones: [],                // { id, box, periods }: a click inside the box opens card `id`
  };
}
```

`mats` is the shared material set from `materials.js`.

`ctx` holds:

| Field | Meaning |
|---|---|
| `quality` | `'low'` (phones, small machines) or `'high'` |
| `plan` | The countryside plan from `planCountryside()`: fields, threshing floors, folds, farmsteads |
| `city` | What `buildCity()` returned: `houses.late` / `houses.early`, `grids`, `gates`, `stalls`, `walk`, `night`, `groups` |
| `terrainY(x, z)` | Height of the ground |
| `free(x, z, margin)` | False on the temple platforms and the palace terrace, which change with the vision shown. Keep off them |

`env`, passed to `update`, holds `time` (seconds), `hours` (0–24), `day` and `night` (0–1), `period`, `walking`, `flying`, `camera`, `focus` (the point on the ground the viewer is at or looking at) and `quality`.

## Rules

- Mark a mesh `userData.solid = true` to make it block the walker and be stood on. Solid meshes are filed once in a grid (`src/walker.js`), so many are cheap; one that moves every frame is tested on its own each step, so keep those few.
- `mats` includes textured materials for props: `wood`, `woodDark`, `pottery`, `clay`, `cloth`, `thatch`, `bark` (projected from three sides, tinted by instance or vertex colour, for things that do not move) and `timber`, `mudPlaster`, `whitewash`.
- Give a mesh `userData.infoId` to open an info card when it is clicked.
- Haze, cloud shadows and night lighting are patched into every material when the scene is finished, so a module's own `MeshStandardMaterial` needs nothing special.
- Draw many alike things as one `InstancedMesh` or one merged geometry. Things only worth seeing close up should follow `env.focus`, as the crowds do.
