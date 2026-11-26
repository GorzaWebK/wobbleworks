# Research: the other Gorza games

Before building Wobbleworks I cloned and read every public repo on **GorzaWebK** and
**GorzaWebA** (16 projects, including the Brain Break Lab hub). The goal was to make
sure Wobbleworks looks, sounds and feels different from all of them.

## What each game is

| Game | Genre | Art style | Palette | Fonts | Menus / HUD | Controls | Code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Skyhook** (K) | First-person grappling-hook time trial | 3D sky world, sunset skies | Dark UI, mint green `#7dff9a`, amber | Segoe UI / system, monospace timers | Dark translucent panels, splits table | Mouse look, click to hook, WASD | Vite, Three.js, `src/*.js`, Firebase online, account codes |
| **Foundry Arena** (K) | First-person arena shooter | 3D industrial yards | Steel greys, safety orange `#ff8a2a`, cobalt / crimson teams | Barlow, Barlow Condensed, Saira Stencil One | Dark panels, stencil type, killfeed, medals | WASD + mouse | Vite, Three.js, big `src/` folder, account codes (`XX1.<payload>.<checksum>`) |
| **Redline** (K) | Time-trial circuit racing | 3D low-poly cars and tracks | Near-black `#0d0f14`, racing red, gold/silver/bronze | Barlow Condensed | Dark panels, lap timers, ghost options | WASD / arrows, Space handbrake | Vite, Three.js, account + online |
| **Orb Dash** (K) | Neon 3D endless runner | Glowing orb in space | Neon magenta `#ff2bd6`, lime `#7dff3a`, yellow | Orbitron | Neon overlays | Arrows / swipe | One `index.html`, Three.js from CDN |
| **Hop Across** (K) | Endless lane-hopping arcade | Voxel low-poly | Sky blue, sunny yellow `#ffcf3f`, white | Arial Rounded MT | Rounded white cards | Arrows / WASD / swipe | Vite, Three.js |
| **Leadlight** (K) | Pinball roguelite | Stained-glass rose window at dusk | Deep purple stone, gilt `#d9b56a`, ruby, cobalt | Cormorant Garamond, Spectral | Gilded gothic panels | Flippers on ←/→, Space plunger | Vite, own 2D physics, `src/` by area |
| **Blueprint Heist** (K) | Top-down stealth | **Dark Prussian-blue blueprint** with white plan lines, a red pencil mark as the player | Navy `#0d3866`, white lines, amber highlight, red | **Architects Daughter**, IBM Plex Sans Condensed | **Centred graph-paper sheet with tape corners**, stacked ruled-line buttons, title-block HUD in the corner | WASD, Shift sneak, Space sprint | Vite, `src/*.js`, planner bot |
| **Needle Drop** (K) | Rhythm (vinyl record) | Bold pop record sleeves | Hot pink `#ff48b0`, navy, yellow | Bungee, Rubik | Cut-paper sleeve cards | F / J / K / Space | Vite, generated music |
| **Paper Tides** (K) | Calm hex-tile placement puzzle | Ink and watercolour island | Warm paper `#f4ecd8`, sea blue-grey, terracotta | **Caveat**, Fraunces | **Centred torn paper card**, stamped outline buttons | Mouse, 1/2/3, R rotate | Vite, `src/*.js` |
| **Felt Links** (K) | Side-on crazy golf | Felt, quilt and fabric | Oat, mustard, rust, sage, denim | Fredoka, **Gochi Hand** | **Corkboard with push-pinned fabric cards**, round numbered "button" level chips, ticket card top-left, round brass buttons top-right, ruler power bar | Pull back to shoot | Vite, own 2D ball physics |
| **Fossil Fixers** (K) | Dig-and-rebuild puzzle | Field journal, kraft paper, leather tool roll | Kraft brown, paper, rust, olive, navy | **Kalam**, Courier Prime (self-hosted) | Field journal, **pinned notes on a map**, tool roll | Mouse/touch, number keys | No build, `js/*.js`, data JSON, **offline account codes** (`FF1.<payload>.<checksum>`) + nickname with "Don't use your real name" |
| **Borderfall** (A) | Real-time world-conquest strategy | Antique map / atlas | Dark umber, parchment, brass, vermilion | Alegreya, Alegreya SC, Alegreya Sans | Dark map panels with neatlines | Mouse, number keys | No build, maps as JS, Firebase/Trystero online |
| **Idle Island** (A) | Idle base defence | 3D island, longboats | Sea teal, sand, coin gold | Grenze, Barlow (self-hosted) | Light grey surfaces | Click/tap, WASD pan | No build, `js/` + `js/r3d/` |
| **Gravity.io** (A) | .io absorb-and-grow | Space, glowing bodies | Inky navy, ember orange, bone | Unbounded, Manrope | Dark plates | Mouse / touch steer | No build, `js/`, `css/` |
| **Stuntrun** (A) | 3D stunt racing | Low-poly desert stunt show | Plum ink, marquee yellow, red, teal | Alfa Slab One, Barlow Condensed | Circus marquee tickets | WASD / arrows | No build, vendored Three.js |
| **Brain Break Lab** (K) | The hub site | Calm, tidy | System UI | System fonts | Card grid | — | Plain HTML/CSS/JS, `activities.json` |

## Systems shared across the games

- **Accounts:** Foundry Arena and Fossil Fixers share an offline account code:
  `XX1.<payload>.<8 hex FNV-1a checksum>`, where the payload is `z` + base64url(deflate-raw(JSON))
  or `j` + base64url(JSON) if the browser can't compress. A player ID uses the
  alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O/1/I). Fossil Fixers adds a nickname box with
  **"Don't use your real name."** Wobbleworks reuses this exact format with the `WW1.` prefix.
- **Settings:** most games have music/SFX volume, key rebinding saved on the device, reduced motion,
  and colour-blind options (Fossil Fixers uses shapes and letters as well as colour).
- **Brain Break Lab rules:** pupil-facing descriptions must avoid the words *game, play, arcade, fun,
  gaming, unblocked*. The hub uses no CDNs or web fonts, and Fossil Fixers self-hosts its fonts so it
  makes no outside requests. Wobbleworks does the same.

## How Wobbleworks stays different

| | Closest existing game | What Wobbleworks does instead |
| --- | --- | --- |
| **Genre** | Felt Links (side-on physics golf), Leadlight (pinball) | A **physics building puzzle**: you build, then press Go! and watch. None of the 16 games is a builder. |
| **Blueprint look** | Blueprint Heist: *dark navy* sheet, white lines | **Light cream graph paper** with bright blueprint-blue *ink* doodles on top, cardboard and wood cut-outs, glossy jelly. Never a dark navy page. |
| **Palette** | Paper Tides / Fossil Fixers (warm paper, muted earth tones) | Cream + blueprint blue + pencil grey with loud **jelly accents: lime `#8ee03a`, tangerine `#ff8a1e`, bubblegum `#ff5fa8`**. Each world gets its own tint wash. |
| **Fonts** | Architects Daughter, Caveat, Gochi Hand, Kalam are all taken | **Patrick Hand** (body) and **Permanent Marker** (headings). Neither is used anywhere else. Both self-hosted. |
| **Main menu** | Centred taped sheet (Blueprint Heist), centred torn card (Paper Tides) | An **off-centre clipboard on a workbench**, with menu items as **square sticky notes in a grid** that peel and wobble. A big jelly Wob bounces beside it. |
| **Level select** | Corkboard + push pins + round chips (Felt Links), pinned map notes (Fossil Fixers) | A **spiral sketchbook hanging from a pegboard hook**. Each level is a **pencil thumbnail of its real layout**, with coloured divider tabs for worlds. No cork, no push pins. |
| **HUD** | Ticket card top-left + round buttons top-right + ruler (Felt Links); title block corner (Blueprint Heist) | A **wooden parts tray** down the left with price tags, a **till receipt** top-right that prints your spending, a giant glossy **jelly "Go!" button**, and jelly-pill tool buttons. The level name is handwritten straight onto the graph paper. |
| **Transitions** | Fades and slides | A **jelly splat wipe**: a wobbling lime blob fills the screen and squelches away (plain fade with reduced motion). |
| **Sound** | Generated music in several games | Cartoon workshop foley: boings, creaks, snaps, pops, squelches, coin clinks, and a light ukulele-and-marimba style tune that changes key per world. |
| **Code** | Vite builds in most K games | No build step: plain ES modules in `/src` (physics, levels, editor, game, ui, audio, account), levels in JSON, deterministic Verlet physics that runs in the browser and in Node for testing. |
