# Ezekiel's Temple

An interactive 3D model of Jerusalem and its temple in three periods, with the temple of Ezekiel's vision (Ezekiel 40–48) laid over it. Solomon's temple and palace (1 Kings 6–7; 2 Chronicles 3–4) are shown as they stood in each period; Ezekiel's temple is built from the measurements in the text and can be switched on as a glowing, colour-coded overlay or as a solid building, so the two can be compared on the same rock.

| Period | The city | The temple |
|---|---|---|
| Solomon's time, c. 950 BC | The City of David and the Ophel, a smaller temple terrace, the Western Hill still farmland, high places on the Mount of Corruption | As built: bronze altar, the Sea on twelve oxen, ten stands with basins, gold-covered doors |
| Ezekiel's time, c. 600 BC | The walled Western Hill and Broad Wall, named gates, Hezekiah's tunnel and the Pool of Siloam, the Silwan tombs | As Ezekiel knew it: Ahaz's great altar with the bronze altar moved north, the Sea on stones, the stands stripped (2 Kgs 16:10–17), the doors stripped of gold (18:16), Jotham's Upper Gate (15:35) |
| After the fall, 573 BC | The year of Ezekiel's vision (40:1): the city burned and broken down, with a Babylonian siege ramp | Burned and roofless, the bronze carried to Babylon (2 Kgs 25:9–17), weeds and jackals in the courts (Lam 5:18) |

## What you can do

- **Look around**: drag to orbit, right-drag (or two fingers) to pan, scroll or pinch to zoom.
- **Walk**: press *Walk at ground level*, then use W A S D or the arrow keys and drag to look. Shift runs. Esc stops. Walls stop you; steps do not.
- **Measure**: click any building, room or object. The panel shows its dimensions in cubits and metres, the Hebrew term, and the verses. Where there is a counterpart in the other temple, one click takes you to it.
- **Choose a period**: *Solomon's time*, *Ezekiel's time* or *After the fall*. The city and the temple change together.
- **Overlay Ezekiel's vision**: *Off* shows the period as it stood. *Glowing* lays Ezekiel's temple over it as light, coloured by part (gold house, orange altar, teal gates, violet chambers, rose western building, blue walls), with a strength slider; parts hidden behind solid buildings show through faintly. *Solid* shows Ezekiel's temple as if built, in place of Solomon's (c. 600 BC and 573 BC). The *Ezekiel vs Solomon* tab has a side-by-side table.
- **Explore the city**: four-room houses on terraces, crenellated walls and named gates, the Stepped Stone Structure, the Gihon Spring towers, pools, gardens, tombs, terraced farmland, threshing floors, people and flocks. Click anything, or a label, for its sources.
- **Look to the horizon**: limestone outcrops and thorny scrub on the hills, the Judean desert falling to the Dead Sea, and the hills of Moab beyond it.
- **Layers**: the river of Ezek 47 with its 1,000-cubit measuring points, the 50-cubit open land of 45:2, the "500 reeds" reading of 42:16–20 at full scale, and the city of Ezek 48 at full scale.
- **Time of day**: move the sun from dawn over the Mount of Olives to sunset.

Links: `#950`, `#600` and `#573` open a period; add `-glow` or `-solid` for the vision, for example `#600-glow` or `#573-solid`. Older links (`#ezekiel`, `#solomon-600`, `#overlay`) still work.

## Run it

It is a static page with no build step. Serve the folder with any web server and open it in a browser with WebGL:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk will not work, because browsers block ES modules on `file://`. Three.js 0.160.0 and the fonts load from public CDNs.

Graphics settings are automatic: phones and machines with four or fewer cores get lighter geometry and no screen effects; others get ambient occlusion, bloom and filmic tone mapping, which are dropped if the frame rate suffers. To override, add `?quality=low` or `?quality=high`, and `fx=on` or `fx=off` (for example `?quality=high&fx=on`).

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
| `src/solomon.js` | Solomon's house, bronze work, courts and palace in each period, and their ruins; shared platforms |
| `src/terrain.js` | Jerusalem terrain, the horizon to the Dead Sea and Moab, platforms per period, terrace shader, painted fields and roads |
| `src/city.js` | Houses, walls and gates, landmarks, trees, vineyards, farm buildings, ruins |
| `src/nature.js` | Limestone outcrops and scrub on the hills; weeds in the ruined courts |
| `src/life.js` | People, flocks, jackals, smoke, the man with the measuring reed |
| `src/vision.js` | The glowing, colour-coded overlay of Ezekiel's vision |
| `src/atmosphere.js` | Haze that thickens in the valleys and glows toward the sun |
| `src/materials.js` | Procedural stone, cedar, gold and carved-panel textures |
| `src/builder.js` | Geometry merging and clickable zones |
| `src/main.js` | Scene, lighting, screen effects, views, walking, picking, UI |

The terrain is a schematic reconstruction from published elevations, not survey data. Everything is generated in code: there are no image or model files.
