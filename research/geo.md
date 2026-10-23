# Geographic base: Karavasta lagoon and Divjakë-Karavasta National Park

Built 2026-10-23 for the signature scroll map and the itinerary planner.

**Attribution:** every page that shows this map must carry **"© OpenStreetMap contributors, ODbL"**, linked to https://www.openstreetmap.org/copyright. The geometry comes from OpenStreetMap under the Open Database License 1.0.

## Files

| File | What it is |
| --- | --- |
| `research/geo.json` | Projection, viewBox, all path data, 20 POIs (lat/lon + x/y + OSM / Google Maps links + source + confidence), build report |
| `research/lagoon-map.svg` | Plain preview: every layer, numbered pins coloured by confidence, a 2× inset of the beach / visitor-centre cluster, legend, 5 km scale bar, attribution |
| `research/geo-build/` | The build kit: `build.py` (projection, Douglas-Peucker, clipping, POIs, SVG), Overpass queries `q1–q9.txt`, `ovp.py` (Overpass client), `osmapi.py` (OSM API element check), `tiles.py` + `overlay.py` (verification), `osm-cache/` (the raw OSM JSON used, fetched 2026-10-23; `q8.json` trimmed to ways). Rebuild with `python -I research/geo-build/build.py research/geo-build/osm-cache research` |

## Data sources (all opened during this build)

- **Overpass API** (`https://overpass-api.de/api/interpreter`), 9 queries, one at a time, `timeout:60`. OSM base timestamps 2026-10-23 09:13–09:48 UTC. `overpass.kumi.systems` and `overpass.private.coffee` were only fallbacks; every successful answer came from overpass-api.de.
- **OSM API 0.6** element pages for every POI and main polygon (`api.openstreetmap.org/api/0.6/<type>/<id>.json`), to confirm the tags and coordinates (`geo-build/osm-cache/api_elements.json`).
- **Cross-checks:** Wikidata Q1945622 (Divjakë, P625 40.9964, 19.5327) and Q13040657 (Karavastë, P625 40.878, 19.4887); en.wikipedia "Karavasta Lagoon" (40°55′39″N 19°29′55″E, 42 km²); en.wikipedia "Pelican Island (Albania)" (40°56′11″N 19°31′04″E). Team research files `business.json` (Hotel Pelikan coordinates from Booking and Google Maps) and `heritage.json` (visit-01…06) are also cited.
- **OSM standard tiles** (z12, 20 tiles) were used only to check the result by eye. They are not part of the output.

## Projection and coordinate system

- Equirectangular (plate carrée) with x scaled by cos(lat0) on a spherical Earth (R = 6371.0088 km).
- Box: lon 19.345 → 19.600, lat 40.800 → 41.062; lat0 = 40.931; cos(lat0) = 0.755499.
- `x = (lon − 19.345) · 0.755499 · 5190.70` and `y = (41.062 − lat) · 5190.70`. The exact constant is `units_per_degree_lat` (5190.6992) in geo.json, and the inverse formula is there too. *(Verifier fix: this line used to say 0.755434 and 5191.1, which did not match geo.json or build.py.)*
- **viewBox `0 0 1000 1360`**. 1 unit = **0.021422 km** (21.4 m); 1 km = 46.68 units. The cos(lat) error across the box is under 0.4 %.
- Compared with Web Mercator tiles, the drawing stays within about 1–2 px over the whole box. It can be laid over a Leaflet or MapLibre view of the same box if that is ever needed.

## Layers (`paths`)

All path data uses absolute `M`/`L`/`Z` commands rounded to 0.1, with consecutive duplicate points removed. Douglas-Peucker ran on the projected coordinates, and each tolerance was found by binary search to fit the point budget.

| Key | OSM source | Raw → kept points | Notes |
| --- | --- | --- | --- |
| `lagoon` | relation 10092047 "Laguna e Karavastasë" (natural=water, water=lagoon, wikidata Q1729043) | 2071 → **760** (ε 0.29 u ≈ 6 m) | Subpath 1 is the outer shore (475 pts). The other 16 subpaths are islets, so use `fill-rule="evenodd"`. Two islets smaller than about 700 m² were dropped (ways 729514169, 729514164). |
| `lagoon_outline` | same | 475 | The outer shore only, for a stroke or self-drawing animation |
| `coast` | natural=coastline chain of 10 ways (27942239 … 357831242) | 455 → **424** | **One open polyline**, starting at the **Seman mouth** (OSM node 5183604549, the south end) and ending at the **Shkumbin mouth** (node 2822287063, the north end). No simplification was needed under the 600 budget, so it is full OSM detail. It follows the inlet and sand spits north of the beach (the open-sea "external godulla" area) exactly as OSM maps them. Reverse the point order for a north-to-south drawing. |
| `coast_full` | same chain, clipped to the viewBox | 490 | Runs from the north edge to the south edge |
| `sea` | `coast_full` + west edge, with the islands as holes | 583 | Use `fill-rule="evenodd"` |
| `coast_islands` | way 1203806603 (sand island) and 1354891926 (islet), both closed natural=coastline | — | Land in the sea north-west of the beach |
| `park` | way 503885261 "Parku Kombëtar Divjakë-Karavasta" (boundary=national_park, protect_class=2, ref:WDPA=4679) | 178 → 157 | Closed polygon |
| `forest` | way **295114375** (landuse=forest) | 1553 → 420 | OSM gives no name and no leaf_type. It is identified as the Divjaka pine forest only by its location: the barrier strip from the Shkumbin down to the lagoon's west shore (confidence medium). Its thin "fingers" into the lagoon are in OSM. |
| `forest_other` | ways 295114437, 611733528 (forest near the Shkumbin), 1074182709 (wood near the Seman mouth) | — | Clipped to the viewBox. These are **not** the Divjaka pine forest. |
| `lagoons_other` | see the table below | — | Each item has `name_sq`/`name_en` (null when OSM has no name), `in_park`, `area_km2`, `osm_url`, `d` |
| `roads` | 4 chains, clipped | 18–52 pts each | Labels are **descriptive** (start and end places from OSM), not official road names |
| `rivers` | Seman (ways 192565835 + 1005011486), Shkumbin (386566807) | 142 / 125 | Centrelines of the lower reaches, for context |
| `boardwalks` | ways 1089837162 (bridge=boardwalk, wood), 1388562406 (footbridge), 1170877709 (wooden footbridge) | — | 1–2 units long at this scale. The pier (way 559801618) is a POI only, with no line. |

### Other water bodies (`lagoons_other`)

| OSM | Name in OSM | In park | Area |
| --- | --- | --- | --- |
| way 295004597 | **Laguna e Godullës** (water=lagoon) | yes | 0.77 km² |
| relation 3688163 | *(no name; water=lake)*: the large lobe between the forest strip and the sea, west of the main lagoon | yes | 5.60 km² |
| ways 282034024 / 282034026 / 282034031 | *(no name; water=lake)*: long narrow waters behind the coast near Adriatik / Nb. Hadaj | yes | 0.35 / 0.11 / 0.05 km² |
| way 1124719283 | *(no name)*: pond by the forest near the Godulla lagoon | yes | 0.09 km² |
| way 534521503 | **Liqeni i Godullës së Veçmës** | no (just south of the boundary, by the Seman mouth) | 0.37 km² |
| way 534521504 | **Liqeni i Petritit** | no | 0.15 km² |

### Roads into Divjakë (`roads`)

| id | OSM ways | Class / ref | Route |
| --- | --- | --- | --- |
| `road-beach` | 444020547, 302285080, 302285077 (bridge), 217295951, 234350436, 234350441 | unclassified, asphalt | Divjakë centre → west across the canal → Visitor Centre → south along the forest → Hotel Pelikan / beach |
| `road-sh57-north` | 768892722, 1008754595/96/600, 217293468, 217293367, 229381393 | secondary, **SH57** | Divjakë → north → east (leaves the box at the north-east). 3 chains, because the small roundabout (way 1008754599) was left out. |
| `road-south` | 768892728, 253300139 | secondary (no ref in OSM) | Divjakë → south along the lagoon's east side → Babunjë |
| `road-east` | 444020552, 291725627, 291732732, 291732729, 655483923 | tertiary | Divjakë → east through Gërmenj i Madh → Tre Urat (clipped at the east edge) |

## POIs (`pois`)

Each POI carries `lat`, `lon`, `x`, `y`, `in_view`, `in_park` (inside the raw OSM park boundary, way 503885261), `osm_url`, `osm_map_url`, `gmaps_url`, `source`, `sources[]`, `confidence`, `notes` and `conflicts`.

| # | id | name_sq | lat, lon | Conf. | Main source |
| --- | --- | --- | --- | --- | --- |
| 1 | hotel-pelikan | Hotel Pelikan | 40.972222, 19.479846 | high | OSM node 11021725056 (+ building way 573637932). Booking (40.972262, 19.479574) and the Google pin (40.9722664, 19.4799887) in business.json agree within about 30 m. |
| 2 | visitor-centre | Qendra e Vizitorëve Divjakë-Karavasta | 40.989789, 19.484654 | **high** | OSM node 8837784839 (survey) + building way 292705751. Google Maps "Visitor Center Divjaka" (plus code XFQM+VR4) is 18 m away (verifier). |
| 3 | pelican-tower | Kulla e Vëzhgimit të Pelikanëve | 40.950357, 19.480795 | **low** | OSM node 11379665876 "Bird watching tower". See the conflicts below. |
| 4 | tower-360 | Kulla 360° | 40.990147, 19.484648 | **high** | OSM way 1124509421 (observation, wood, 35 m, fee=yes). Google Maps place "Kulla 360°" is 7 m away (verifier). |
| 5 | divjake-centre | Divjakë (qendra) | 40.995621, 19.533122 | high | OSM node 728427729 + Wikidata Q1945622 (about 90 m apart) |
| 6 | divjaka-beach | Plazhi i Divjakës | 40.971553, 19.477481 | medium | OSM node 7875214285 "Divjaka beach". It marks the resort access point; the beach itself is the long natural=beach way 234350457. |
| 7 | karavasta-village | Karavasta | **40.877650, 19.488546** | medium | Position of OSM node 728425225. **Moved ~1 km east by the verifier:** Google Maps ("Karavasta Fshat"), GeoNames, Wikidata and sq.wikipedia put Karavasta here; OSM has the two village names swapped (see conflict 3). |
| 8 | infopoint | Pika e informacionit e Parkut Kombëtar | 40.990503, 19.470129 | medium | OSM node 11025002431 |
| 9 | lagoon-boat-trips | Shëtitje me varkë në lagunë | 40.989830, 19.496446 | medium | OSM node 13765370901 (heritage visit-06: AKT confirms boat trips; the operator is not verified) |
| 10 | boardwalk | Shteg druri mbi ujë | 40.990268, 19.491327 | medium | OSM way 1089837162 (bridge=boardwalk) |
| 11 | footbridge-canal | Urë këmbësorësh mbi kanal | 40.990316, 19.497082 | medium | OSM way 1388562406 |
| 12 | footbridge-beach | Urë druri te plazhi | 40.974155, 19.471971 | medium | OSM way 1170877709 |
| 13 | pier-godulla | Mol në Lagunën e Godullës | 40.991951, 19.480885 | medium | OSM way 559801618 (man_made=pier) |
| 14 | bird-hide-godulla | Vendvëzhgim zogjsh te Godulla | 40.992399, 19.481030 | medium | OSM node 12853547415 |
| 15 | ishulli-hapashalit | Ishulli Hapashalit | 40.967138, 19.502338 | medium | OSM relation 10092045 (place=islet, source=GNS) |
| 16 | pelican-island | Ishulli i Pelikanit | 40.93639, 19.51778 | **low** | en.wikipedia only. Not in OSM; see below. |
| 17 | seman-mouth | Grykëderdhja e Semanit | 40.823640, 19.364787 | medium | OSM river way 1005011486 end = coastline node 5183604549 |
| 18 | shkumbin-mouth | Grykëderdhja e Shkumbinit | 41.040092, 19.442706 | medium | OSM river way 386566807 end = coastline node 2822287063 |
| 19 | altin-nature-collection | Koleksioni Natyror i Altinit | 40.992890, 19.531482 | medium | OSM node 8890781407 (private nature museum, Rruga Zona 20) |
| 20 | st-cosmas-monastery | Manastiri dhe Varri i Shën Kozmait | 40.803085, 19.543394 | medium | OSM node 9033692799 (at the south edge of the box) |
Each POI also has a `name_source` field. The `name_sq`/`name_en` values of the minor POIs (10–14, 17–18) are **descriptive labels**, because OSM gives no name for those objects. POI 3 takes its name from the client's spec. POI 16 takes its name from Wikipedia. POI 7 takes its name from Google Maps, GeoNames, Wikidata and sq.wikipedia, because OSM calls that node "Karavasta e Re". Only these names come from OSM itself: Hotel Pelikan, NP Divjake-Karavasta Visitors Centre, Kulla 360°, Divjakë, Divjaka beach, Infopoint National Park Divjaka-Karavasta, Lagoon Boat Trips, Ishulli Hapashalit, Koleksioni Natyror i Altinit, and Manastiri dhe Varri i Shën Kozmait.

## Conflicts (recorded, not resolved)

1. **Pelican observation tower.**
   - OSM node 11379665876 (tourism=viewpoint, name:en "Bird watching tower", 2023) stands on the lagoon's west shore at the end of the track south of the beach. AOS (heritage visit-03) says the Pelican Trail ends at "the observation tower of the pelican colony".
   - At the **same spot**, OSM node 8738280465 (leisure=bird_hide) is tagged `note=destroyed`, `opening_hours=Mo-Su off`, `check_date=2025-09-24`, `source=survey`.
   - It is also unconfirmed whether the client's "Kulla e Vëzhgimit të Pelikanëve" is this tower or the 35/36 m "Kulla 360°" at the visitor centre.
   - *Verifier:* on Esri World Imagery (z18) the point sits on a small vegetated bar at the canal mouth, at the end of the track. OSM maps that bar as lagoon water, so the pin falls about 160 m inside the drawn shore.
   - *Verifier:* a Google Maps search for "observation tower" around this point lists only Kulla 360°. Google has no separate tower here.
   - Confidence is low. Ask the client, and check on site.
2. **Kulla 360° height:** OSM `height=35`; AKT text says 36 m.
3. **Karavasta village** *(resolved by the verifier: the POI now sits on the eastern village)*:
   - OSM names the western node 728424535 (40.8778, 19.4770) "Karavasta" and the eastern node 728425225 (40.87765, 19.48855) "Karavasta e Re". The names have been this way in OSM since 2011.
   - The OSM nodes' `wikidata` tags were added on 2025-12-04, and each points to the item whose P625 coordinate is the *other* node's position:
     - Q13040657 "Karavastë" is at 40.878, 19.4887 (east).
     - Q16359491 "Karavastë e Re" is at 40.8778, 19.4769 (west).
   - Every other source puts Karavasta to the east:
     - **Google Maps** shows "Karavasta e Re" in the west and "Karavasta Fshat" in the east. The Google place "Karavasta e Re" is at 40.878651, 19.4757378.
     - **GeoNames** has "Karavasta" at 40°52′39″N 19°29′27″E (east).
     - **sq.wikipedia "Karavasta"** says Karavasta e Re lies to its west: "Në perëndim kufizohet me fshatin e Karavastasë së Re".
   - en.wikipedia "Divjakë" lists both "Karavasta e Re" and "Karavasta Fshat" as villages.
   - On the imagery, the eastern village has an irregular, older layout and the western one a planned grid. That fits the name "e Re" (new) for the western one, but it is only supporting evidence.
   - Confidence stays **medium**, because OSM disagrees. If the site links to OSM, note that the OSM label there reads "Karavasta e Re".
4. **Pelican Island:**
   - The en.wikipedia coordinate (40.93639, 19.51778) lies in **open lagoon water** in OSM. It is inside the lagoon outer ring and on no OSM islet; the build checked this.
   - No islet is named Pelican Island in OSM.
   - The point is about 3 km east of the "Bird watching tower" that AOS says overlooks the island.
   - *Verifier:* Esri World Imagery (z16) shows open water and no islet within about 1 km of the point.
   - *Verifier:* the AKT page gives no location, and en.wikipedia cites no source for the coordinate.
   - Show it as an approximate, closed zone (it is closed to the public, heritage park-23), never as a destination pin with a route.
5. **Divjaka beach:** "Divjaka beach" in OSM is a point at the resort entrance. The sand beach (way 234350457, unnamed) runs for kilometres, so the pin is an access point, not the whole beach.
6. **Lagoon size** *(found by the verifier)*:
   - en.wikipedia "Karavasta Lagoon" gives 42 km², 15.4 km long and 4.1 km wide.
   - The drawn outer shore (OSM relation 10092047) encloses 42.2 km², or 42.05 km² without the islets. That matches the area, and Wikidata Q1729043 also gives 42.
   - Measured on the drawing, the longest chord is 11.8 km (from the south-west corner to the north tip), and the width across it is 5.6 km.
   - The outline matches satellite imagery, so the 15.4 × 4.1 km figures do not describe this shape. **Do not print length or width on the site**; the area (about 42 km²) is safe.

## Could not locate / not mapped

- **Godulla e Dajlanit** (named in the 2007 park decision, heritage park-04) and the **"external godulla"** (heritage lagoon-08): OSM has no water body with these names, so neither can be tied to a polygon. The unnamed relation 3688163 and ways 282034024/26/31 are candidates, but they stay **unnamed** here.
- **Pelican Trail** ("Shtegu i Pelikanëve"): there is no named footway or path in OSM (Overpass q8 found no named paths in the park). It is not drawn.
- **Kular habitats / zone:** no OSM feature by that name.
- **Park sub-zones** (core / sustainable / traditional use, 2007 decision): OSM has no polygons for them.
- **Pier line geometry:** only the centre point was kept (POI 13).
- No second, non-OSM coordinate source was opened for these POIs: the beach, the boardwalk and bridges, the pier, the bird hide, the infopoint and the boat-trip point. All of them stay **medium**. (The verifier confirmed the visitor centre and the 360° tower on Google Maps, so those two are now **high**.)

## Using it on the site

- **Self-drawing coast:** use `paths.coast` as a stroke with `pathLength="1"` and animate `stroke-dashoffset` from 1 to 0. It is a single subpath (one `M`). For the lagoon shore, use `paths.lagoon_outline`.
- **Fills:** `sea` and `lagoon` need `fill-rule="evenodd"`.
- **Pins:** position them with `pois[].x/y` in the same viewBox. Links: `osm_map_url` (OpenStreetMap at z17) and `gmaps_url` (Google Maps search by coordinates).
- **Distances:** units × 0.021422 = km. For walking and driving times, use a router (for example OSRM); straight-line distance is not enough.
- **Low-confidence POIs:** keep `confidence: low` items (3, 16) visually marked as "approximate", or hide them until they are confirmed.

## Build self-check (researcher)

- The preview SVG was rasterized with headless Chrome. The paths were then drawn over OSM standard tiles (z12) reprojected into the same system.
- Coast, lagoon shore, park boundary, roads and pins line up with the tile map to within about 1–2 px.
- Seman and Shkumbin mouths sit where the rivers meet the coast. Divjakë sits on SH57, and Hotel Pelikan sits at the end of the beach road.
- The check images are in the session scratchpad and are not deliverables.

## Verification

Independent adversarial check, 2026-10-23. The verifier did not reuse the builder's `tiles.py` / `overlay.py`; its own scripts and check images are in the session scratchpad only.

### What was checked

| Check | Method | Result |
| --- | --- | --- |
| Path data parses | Tokenised every `d` string in geo.json (29 paths and items) | **Pass.** There are only absolute `M`/`L`/`Z` commands, no stray characters, no NaN, and no point outside `0 0 1000 1360`. Every geo.json path appears verbatim in lagoon-map.svg. `coast` is one open subpath from (77.6, 1237.3) = Seman mouth to (383.2, 113.7) = Shkumbin mouth. `lagoon` has 17 closed subpaths. `sea` has 3 subpaths (open water and 2 island holes). |
| Projection constants | Recomputed cos(40.931°), units/degree, km/unit and the 1360 height | **Pass** in geo.json (0.755499, 5190.6992, 0.021422 km/unit). **Fixed** in this file: it said 0.755434 / 5191.1. |
| POI x/y vs lat/lon | Re-projected all 20 POIs | **Pass.** All are within 0.05 units, and each SVG pin sits at its geo.json x/y. The inset pins map back to the same points (2×, origin 470/330). |
| POIs vs OSM | Re-fetched all 18 OSM POI elements and 5 related ones from `api.openstreetmap.org/api/0.6` | **Pass.** Coordinates are identical; the pier is 6 m off because of how its vertices are averaged. The tags match what geo.md quotes, including the bird hide 8738280465 `note=destroyed`, `check_date=2025-09-24`. |
| Shape and orientation | Overlaid the lagoon, coast, forest, park, `lagoons_other`, roads and pins on **Esri World Imagery** (z13 for the whole box; z16 for the beach and visitor-centre cluster, Pelican Island and Karavasta; z18 for the pelican tower) and on **OSM standard tiles** (z12, z16, z17). The tiles were reprojected into this equirectangular system. | **Pass.** The **sea is to the west** of the coast in all 103 sampled rows. The lagoon shore follows the dark water on the satellite image to within about 1–2 units (20–40 m), including the forest "fingers", the Hapashali islet area and the south-west corner. The lagoon's long axis bears about **20° (NNE–SSW)**, with the forested sand barrier on its west side. The Shkumbin mouth is at the north-west and the Seman mouth at the south-west tip. The inlet behind the beach spit north of Hotel Pelikan is real sea on the imagery. |
| Area | Shoelace area of the drawn rings | The outer shore encloses 42.2 km², or 42.05 km² without the islets. en.wikipedia "Karavasta Lagoon" and Wikidata Q1729043 give 42 km², so the area **matches**. Length and width do **not** match: see conflict 6. |
| Lagoon centre | Vertex centroid | 40.9352, 19.4966, about 0.85 km from the en.wikipedia/Wikidata point 40.9275, 19.4986. Consistent. |
| Within the park | Point-in-polygon against the raw OSM boundary (way 503885261, 217.5 km²) | 18 of 20 POIs are inside; the new field is `in_park`. The 2 outside are **footbridge-beach** (on the beach spit, about 300 m west of the OSM boundary) and **st-cosmas-monastery** (a cultural site about 7 km south of the park). Divjakë town and the Altin collection are also inside the OSM boundary, which reaches the hills east of town. That boundary has not been checked against the official 2007 park map. All 8 `lagoons_other` `in_park` flags are correct. |
| Pin placement by eye | Same overlays | Hotel Pelikan sits on the OSM hotel icon at the end of the beach road. The visitor centre and Kulla 360° sit on the ranger-station building and tower icon. The boardwalk, the canal footbridge and the boat point sit on the road and canal; the pier and bird hide sit on the east shore of the Godulla lagoon; footbridge-beach crosses the inlet. Divjakë is on SH57. **Karavasta was on the wrong village** (fixed, see below). **Pelican tower**: it sits on a small vegetated bar inside the OSM lagoon polygon. **Pelican Island**: there is open water at the Wikipedia point. |

### What was changed

The changes were made in `geo-build/build.py`, then both deliverables were rebuilt with the documented command. Before editing, the verifier confirmed that a rebuild from the cache gives a byte-identical copy of the old outputs.

1. **`karavasta-village` moved about 1 km east**, to 40.877650, 19.488546 (OSM node 728425225; x 562.9, y 956.9). OSM has the two village names swapped compared with Google Maps, GeoNames, Wikidata and sq.wikipedia (conflict 3). The confidence stays medium, and the sources, notes, conflicts and `name_source` were rewritten.
2. **`visitor-centre` → high.** The Google Maps "Visitor Center Divjaka" plus code 8FGXXFQM+VR4 decodes to 40.98964, 19.48458, 18 m from OSM. The "National Park Divjakë - Karavasta Office" (XFQM+WVJ) is 6 m away.
3. **`tower-360` → high.** The Google Maps place "Kulla 360°" is at 40.990179, 19.4847204, 7 m from OSM.
4. **`in_park` added** to every POI.
5. **Notes added** to `pelican-tower` and `pelican-island` (imagery and Google findings). Both stay **low**.
6. **SVG legend moved** from x = 560 to x = 588, because the box had been drawn over the new Karavasta pin. No other part of the drawing changed.
7. A **`verification` block was added** to geo.json.
8. This file was updated: projection constants, POI table rows 2, 4 and 7, conflicts 1, 3 and 4, the new conflict 6, and the "not located" list. The builder's old "Verification" heading is now "Build self-check (researcher)".

### Still unverified

- **The pelican tower:** whether it still stands, and which tower the client means. The OSM viewpoint (2023) and the "destroyed" bird hide (survey 2025-09-24) are at the same spot. Imagery cannot settle whether a standing tower is there. → Ask the client, or check on site.
- **Pelican Island position:** the only coordinate (en.wikipedia) has no cited source and falls in open water. No second source was found.
- **Single-source POIs:** the beach access point, infopoint, boat-trip point, boardwalk, the two footbridges, the pier, the bird hide, Ishulli Hapashalit, the river mouths (which move over time), the Altin collection and the St Cosmas monastery each still rest on OSM alone. They line up with the imagery, but no second source was opened for them.
- **OSM data error:** OSM's Karavasta / Karavasta e Re name swap is not fixed upstream. Any OSM-based basemap the site embeds will show the old labels.
- **Park boundary:** only OSM gives it (about 217.5 km²). The verifier did not open an official boundary map. Whether Divjakë town lies inside the protected area should not be claimed from this geometry alone.
- **Lagoon dimensions:** en.wikipedia's 15.4 × 4.1 km does not match the geometry (conflict 6). Use the area only.

### Sources opened by the verifier

- OSM API 0.6, element and history pages for every POI node or way listed above, plus nodes 8738280465, 728425225 and 728424535 (history), and ways 573637932, 292705751 and 302285077.
- OSM standard tiles: `tile.openstreetmap.org` z12, z16 and z17.
- Esri World Imagery: `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer` z13, z16 and z18.
- https://en.wikipedia.org/wiki/Karavasta_Lagoon
- https://en.wikipedia.org/wiki/Pelican_Island_(Albania)
- https://sq.wikipedia.org/wiki/Karavasta
- https://sq.wikipedia.org/wiki/Karavasta_e_Re (stub; no coordinates)
- Wikidata `wbgetentities` for Q13040657, Q16359491, Q1945622 and Q1729043
- https://www.geonames.org/search.html?q=Karavasta&country=AL
- https://akt.gov.al/en/attractions/Pelican-Island/
- https://www.birdingplaces.eu/en/birdingplaces/albania/divjake-karavasta-national-park
- Google Maps, opened in the browser:
  - `/maps/@40.8775,19.4830,15z` (village labels)
  - `/maps/search/Karavasta+e+Re,+Divjakë,+Albania`
  - `/maps/search/Divjakë-Karavasta+National+Park+Visitor+Centre`
  - `/maps/search/Kulla+360+Divjakë`
  - `/maps/search/observation+tower/@40.950357,19.480795,15z`
