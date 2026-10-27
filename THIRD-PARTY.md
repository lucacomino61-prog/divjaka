# Third-party software and content

What this site ships or shows that someone else made, and the licence each comes with. Everything
below was read from files in this repository (package manifests and LICENSE files in
`node_modules/`, `public/fonts/LICENSES/`, `research/photos.json`, `research/ASSETS.md`,
`research/geo.md`, `research/live.md`, `src/lib/live.ts`) on 2026-10-27. The site shows the same
credits to visitors on `/kreditet/` (`/en/credits/`).

This file does not license the project's own code. No licence has been chosen for it yet; until a
`LICENSE` file is added, all rights are reserved (see `README.md`, "Licences").

## Software

### Runtime dependencies (`package.json` → `dependencies`)

| Package | Version | Licence | Copyright line in its LICENSE / README | Where it runs |
|---|---|---|---|---|
| [`astro`](https://astro.build) | 7.4.2 | MIT | © 2021 Fred K. Schott | server (SSR) and build |
| [`@astrojs/node`](https://docs.astro.build/en/guides/integrations-guide/node/) | 11.1.9 | MIT | © 2021 Fred K. Schott | server adapter |
| [`gsap`](https://gsap.com) | 3.15.0 | GreenSock **Standard "no charge" licence** (not MIT, see below) | © 2008-2026, GreenSock. All rights reserved. | browser: `gsap`, `gsap/ScrollTrigger`, `gsap/SplitText`, `gsap/DrawSVGPlugin` |
| [`lenis`](https://github.com/darkroomengineering/lenis) | 1.3.27 | MIT | © 2024 darkroom.engineering | browser (smooth scrolling) |
| [`zod`](https://zod.dev) | 4.6.7 | MIT | © 2025 Colin McDonnell | server (input validation) |

**GSAP.** Its `package.json` gives the licence as "Standard 'no charge' license:
https://gsap.com/standard-license" and its README says "Copyright (c) 2008-2026, GreenSock. All
rights reserved." The licence text itself is not in the npm package or in this repository; read
the terms at <https://gsap.com/standard-license> before shipping, forking or reusing the code, and
keep GSAP's own files under GreenSock's terms. They are not covered by whatever licence the owner
later chooses for this project.

### The whole production dependency tree

`npm ls --omit=dev --all` lists 208 packages (the five above plus what they pull in, mostly
Astro's build tooling). Their `package.json` licence fields: MIT 172, ISC 12, BSD-2-Clause 8,
Apache-2.0 4 (`aria-query`, `axobject-query`, `sharp`, `detect-libc`), BlueOak-1.0.0 3
(`common-ancestor-path`, `sax`, `lru-cache`), BSD-3-Clause 3 (`diff`, `smol-toml`,
`source-map-js`), MPL-2.0 2 (`lightningcss` and its platform binary), CC0-1.0 2 (`mdn-data`),
GreenSock Standard 1 (`gsap`), and "Apache-2.0 AND LGPL-3.0-or-later" 1 (`@img/sharp-win32-x64`,
the prebuilt libvips binary that `sharp` installs on Windows; other platforms get their own
`@img/sharp-*` package). Each package keeps its own licence file in `node_modules/<name>/`.
Re-run the command after an upgrade; the counts above are for the current `package-lock.json`.

Dev dependencies (`@astrojs/check`, `@playwright/test`, `@types/node`, `opentype.js`,
`typescript`) are used for checks, tests and build tools only and are not shipped.

## Fonts (`public/fonts/`)

All three are under the **SIL Open Font License 1.1**; the full texts are in
`public/fonts/LICENSES/`. They were downloaded on 2026-10-23 from <https://github.com/google/fonts>
and subset to latin and latin-ext woff2 files with no glyph or outline changes
(`public/fonts/LICENSES/README.txt`).

| Font | Files | Copyright (from its OFL file) | Licence file |
|---|---|---|---|
| Bricolage Grotesque (variable opsz, wdth, wght) | `bricolage-grotesque-var-*.woff2` | © 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage) | `BricolageGrotesque-OFL.txt` |
| Instrument Serif (regular, italic) | `instrument-serif-*.woff2` | © 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) | `InstrumentSerif-OFL.txt` |
| Geist Mono (variable wght) | `geist-mono-var-*.woff2` | © 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git) | `GeistMono-OFL.txt` |

Derived from Bricolage Grotesque, under the same licence: the static instances in `tools/fonts/`,
and the outlined wordmark in `src/assets/wordmark.ts` (built by `tools/wordmark.mjs`), which
`tools/icons.mjs` also draws into `public/og-default.png`.

## Map data

The lagoon chart (`research/geo.json`, drawn by `src/components/chart/Chart.astro` and
`MiniChart.astro`) is built from **OpenStreetMap** data: **© OpenStreetMap contributors**, under the
[Open Database License 1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/)
(`research/geo.md`). Every page that shows the chart prints the attribution, linked to
<https://www.openstreetmap.org/copyright>.

## Live data (`/tani/`, `/en/now/`)

The readings come from the providers below, each credited next to the readings and on the credits
page (`liveSources()` in `src/lib/live.ts`). Terms as recorded in `research/live.md` (opened
2026-10-23).

| Reading | Provider | Terms |
|---|---|---|
| Weather, wind, humidity, cloud, rain, pressure, 7-day forecast | [MET Norway](https://api.met.no/) Locationforecast 2.0 | Data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and NLOD 2.0, credit "Data from MET Norway" ([api.met.no/doc/License](https://api.met.no/doc/License)). Free, including commercial use (MET FAQ). Terms of service: identifying User-Agent with a contact (`LIVE_CONTACT`), at most 4 decimals in coordinates, no repeat before `Expires`. |
| Sea surface temperature | [NASA JPL MUR SST v4.1](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1) via NOAA CoastWatch ERDDAP (`jplMURSST41`) | The ERDDAP dataset licence: "These data are available free of charge under the JPL PO.DAAC data policy. The data may be used and redistributed for free but is not intended for legal use." Acknowledgement: "These data were provided by JPL under support by NASA MEaSUREs program." Citing guidance: <https://podaac.jpl.nasa.gov/CitingPODAAC>. |
| Air quality, waves, actual UV (only when `OPEN_METEO_API_KEY` is set) | [Open-Meteo](https://open-meteo.com/) commercial API (CAMS, DWD) | CC BY 4.0, credit with a link next to the data; commercial use needs a paid plan. Off by default. |
| Sunrise, sunset, golden hour, twilight | computed on the server for the hotel's coordinates (USNO solar position, NOAA hour-angle formulas) | No third-party data; the formulas are public domain (<https://gml.noaa.gov/grad/solcalc/>). |

## Photos (`public/photos/`)

32 photographs from **Wikimedia Commons**, each under its own licence: CC BY-SA 4.0 (20),
CC BY 4.0 (4), CC0 (4), CC BY 2.0 (2), CC BY-SA 2.0 (1), CC BY-SA 3.0 (1). All allow commercial
use. Every file was resized and re-encoded to AVIF/WebP with metadata removed; `beach-shelters`
was also cropped (left 93 %, to remove a pole and a wire). Author and licence were read from each
file's Commons page on 2026-10-23 and re-checked the same day (`research/ASSETS.md`,
"Verification"). Each photo is one slug with several sizes (`<slug>-<width>.avif|webp`).

Reusing a photo means keeping its author credit and a link to its licence; CC BY-SA photos, and
any edits of them, stay under the same CC BY-SA licence.

| File (`public/photos/`) | Author | Licence | Commons page | Changes |
|---|---|---|---|---|
| `lagoon-sunset` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Sunset_in_Divjaka_Karavasta_lagoon.jpg) | resized, re-encoded |
| `lagoon-fishermen-house` | Julien Seguinot | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [Commons](https://commons.wikimedia.org/wiki/File:A_fishermen_house_in_Karavasta_Lagoon_(Divjak%C3%AB-Karavasta_National_Park).jpg) | resized, re-encoded |
| `lagoon-sunset-footbridge` | Android4smarts | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Perendimi_i_diellit_ne_Divjake.jpg) | resized, re-encoded |
| `lagoon-fishing-boats` | Julianruizp | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Laguna_Karavastase_HD.jpg) | resized, re-encoded |
| `lagoon-view-from-above` | Darioharuni | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Divjak%C3%AB-Karavasta,_peizazh_piktoresk.jpg) | resized, re-encoded |
| `lagoon-pine-reflection` | Nicolas Vollmer | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [Commons](https://commons.wikimedia.org/wiki/File:Habitat_in_Divjak%C3%AB-Karavasta_National_Park,_Albania.jpg) | resized, re-encoded |
| `lagoon-from-observation-tower` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:View_taken_from_the_observation_tower,_over_the_lagoon_of_Karavatsa.jpg) | resized, re-encoded |
| `lagoon-islets` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Pjese_toke_ne_lagunen_e_karavastas_qe_duket_si_harte.jpg) | resized, re-encoded |
| `lagoon-dusk` | Arxet | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Laguna_e_Karavastas%C3%AB_(Nat%C3%ABn).jpg) | resized, re-encoded |
| `pelicans-karavasta` | Arbenllapashtica | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Pelikan_Divjake_Arben_Llapashtica.jpg) | resized, re-encoded |
| `pelican-xhimi` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Dalmatian_Pelican_in_l_divjaka_park_nationa.jpg) | resized, re-encoded |
| `pelicans-visitor-centre` | Arjola Dema | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Pelicans_communicating.jpg) | resized, re-encoded |
| `pine-forest-light` | Bunker92 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Divjaka_(7).jpg) | resized, re-encoded |
| `pine-forest-wetland` | Srg.dnch | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Conifer_forest_and_wet_grassland_in_Divjaka-Karavasta_National_Park.jpg) | resized, re-encoded |
| `pine-forest-from-above` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Parku_i_Divjake_karavasta.jpg) | resized, re-encoded |
| `beach-shelters` | Leeturtle | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Karavasta_bay,_Divjak%C3%AB,_Albania_2.jpg) | cropped, resized, re-encoded |
| `beach-dunes` | Albinfo | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | [Commons](https://commons.wikimedia.org/wiki/File:Sand_dunes_at_Divjaka_beach_(OSCAL19_trip).jpg) | resized, re-encoded |
| `beach-from-tower` | Albinfo | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | [Commons](https://commons.wikimedia.org/wiki/File:Divjaka_Beach_from_tower_(OSCAL19_trip).jpg) | resized, re-encoded |
| `tower-360` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Kulla_360_grade_ne_Divjake.jpg) | resized, re-encoded |
| `birdwatch-tower-boardwalk` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:The_observation_tower_in_the_lagoon_of_Karavatsa.jpg) | resized, re-encoded |
| `wooden-bridges-park` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Wooden_bridge_for_crossing_over_the_lagoon_in_karavasta.jpg) | resized, re-encoded |
| `visitor-centre` | Big Virgil | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Visitor_Center_Divjaka.jpg) | resized, re-encoded |
| `visitor-centre-garden` | Albinfo | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | [Commons](https://commons.wikimedia.org/wiki/File:Divjaka-Karavasta_National_Park_Visitor_Center_(OSCAL19_trip).jpg) | resized, re-encoded |
| `flamingos-wading` | Arbenllapashtica | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Flamingo_Divjak%C3%AB.jpg) | resized, re-encoded |
| `flamingos-flight` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Tre_flamengo_duke_fluturuar_krah_njeri_tjetrit.jpg) | resized, re-encoded |
| `flamingos-flock-lagoon` | AMcreative1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:A_flock_of_flamingos_flying_side_by_side_and_landing_on_the_lagoon_of_Karavasta.jpg) | resized, re-encoded |
| `egret-lagoon` | Albinfo | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Heron_in_Divjak%C3%AB_National_Park.jpg) | resized, re-encoded |
| `ardenica-monastery` | Marmontel | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [Commons](https://commons.wikimedia.org/wiki/File:%C3%89glise_de_la_Nativit%C3%A9_de_la_M%C3%A8re_de_Dieu_1743_(53100021886).jpg) | resized, re-encoded |
| `apollonia` | Inkey | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Commons](https://commons.wikimedia.org/wiki/File:Appolonia_Albania.jpg) | resized, re-encoded |
| `lagoon-fishing-nets` | Darioharuni | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Peshkarexha_n%C3%AB_Divjak%C3%AB-Karavasta.jpg) | resized, re-encoded |
| `lagoon-boat-trips` | ErtonKashta | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Sh%C3%ABtitje_me_varka_n%C3%AB_Lagun%C3%ABn_e_Karavastas%C3%AB.jpg) | resized, re-encoded |
| `divjake-town-square` | Albinfo | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | [Commons](https://commons.wikimedia.org/wiki/File:Divjaka_central_square_(OSCAL19_trip).jpg) | resized, re-encoded |

## Facts and texts

The heritage, nature and travel texts are the project's own writing, built on facts from public
sources (among them Albanian government agencies, the Ramsar site information service, Wikipedia
and Albanian and international conservation organisations). Every fact keeps its source link in
`research/heritage.json`, and the credits page lists the publishers.
