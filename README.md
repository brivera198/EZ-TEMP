# Ezekiel's Temple

An interactive 3D model of the temple in Ezekiel's vision (Ezekiel 40–48), built from the measurements in the text and set on the Temple Mount in a reconstruction of Iron Age Jerusalem. Solomon's temple and palace (1 Kings 6–7; 2 Chronicles 3–4) are modelled on the same site, so the two can be compared directly.

The city around them changes with the period:

| Period | What you see |
|---|---|
| c. 950 BC | Solomon's Jerusalem: the City of David and the Ophel, a smaller temple terrace, the Western Hill still farmland, high places on the Mount of Corruption |
| c. 600 BC | The last years of Judah: the walled Western Hill and Broad Wall, named gates, Hezekiah's tunnel and the Pool of Siloam, the Silwan tombs |
| 573 BC | The year of Ezekiel's vision (40:1): the city burned and broken down, with a Babylonian siege ramp |

## What you can do

- **Look around**: drag to orbit, right-drag (or two fingers) to pan, scroll or pinch to zoom.
- **Walk**: press *Walk at ground level*, then use W A S D or the arrow keys and drag to look. Shift runs. Esc stops. Walls stop you; steps do not.
- **Measure**: click any building, room or object. The panel shows its dimensions in cubits and metres, the Hebrew term, and the verses. Where there is a counterpart in the other temple, one click takes you to it.
- **Compare**: switch between *Ezekiel*, *Solomon* and *Overlay* (Solomon's house as a blue outline over Ezekiel's). The *Ezekiel vs Solomon* tab has a side-by-side table.
- **Change period**: the buttons under the temple switch move the city between c. 950 BC, c. 600 BC and 573 BC.
- **Explore the city**: four-room houses on terraces, crenellated walls and named gates, the Stepped Stone Structure, the Gihon Spring towers, pools, gardens, tombs, terraced farmland, threshing floors, people and flocks. Click anything, or a label, for its sources.
- **Layers**: the river of Ezek 47 with its 1,000-cubit measuring points, the 50-cubit open land of 45:2, the "500 reeds" reading of 42:16–20 at full scale, and the city of Ezek 48 at full scale.
- **Time of day**: move the sun from dawn over the Mount of Olives to sunset.

Links: `#ezekiel`, `#solomon` and `#overlay` open the matching mode; add the year for another period, for example `#ezekiel-573` or `#solomon-600`.

## Run it

It is a static page with no build step. Serve the folder with any web server and open it in a browser with WebGL:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk will not work, because browsers block ES modules on `file://`. Three.js 0.160.0 and the fonts load from public CDNs.

## The measurements

[`docs/MEASUREMENTS.md`](docs/MEASUREMENTS.md) lists every measurement in Ezekiel 40–48 with its verse, the matching figures for Solomon's temple, the cross-checks (the gate parts add up to 50 cubits, the house to 100, the precinct to 500), and every assumption the model makes where the text is silent.

[`docs/HISTORY.md`](docs/HISTORY.md) covers the city and countryside: what each period shows, and for every feature whether it is attested, probable or conjectural, with sources.

Key choices:

| Question | Choice | Reason |
|---|---|---|
| Cubit | Long cubit, 52.5 cm | "A cubit and a handbreadth" (40:5) |
| 500 reeds or cubits? (42:16–20) | Cubits | The inner measurements sum to 500 cubits; LXX reads cubits |
| Where on the map? | Most Holy Place over the rock on the Temple Mount | Traditional site of both temples |
| Heights Ezekiel does not give | House 30 cubits, gates 20 | Solomon's height; LXX of 40:14 |

## Files

| File | What it holds |
|---|---|
| `index.html` | Page, panels and styles |
| `src/data.js` | Units, levels, info cards, comparison table, landmarks |
| `src/ezekiel.js` | Ezekiel's precinct, gates, courts, house, river, outlines |
| `src/solomon.js` | Solomon's house, bronze work, courts, palace; shared platforms |
| `src/terrain.js` | Jerusalem terrain, platforms per period, terrace shader, painted fields and roads |
| `src/city.js` | Houses, walls and gates, landmarks, trees, vineyards, farm buildings, ruins |
| `src/life.js` | People, flocks, smoke, the man with the measuring reed |
| `src/materials.js` | Procedural stone, cedar, gold and carved-panel textures |
| `src/builder.js` | Geometry merging and clickable zones |
| `src/main.js` | Scene, lighting, views, walking, picking, UI |

The terrain is a schematic reconstruction from published elevations, not survey data.
