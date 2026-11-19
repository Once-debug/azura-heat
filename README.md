# AZURA HEAT — NEON TIDE

A top-down open-world crime game in the browser. One city, one nobody, one
festival — and every phone in Azura Bay pointed at you.

> Rook drove into Azura Bay with a hundred dollars and a past. The Neon Tide
> festival provides the rest — the work, the wheels, the witnesses, and the
> cameras. Run jobs for Vera and Sal, build a name the sponsors can't ignore,
> and try not to trend for the wrong reasons.

**Play it:** serve the folder and open the page — `node serve.ts`, then
<http://localhost:8080>. No build step, no dependencies, no network: the whole
game is plain static files (`game/index.html` and its ES modules).

---

## The city

Azura Bay is a 3200×2400 top-down city generated from a fixed seed — the same
streets every visit. Four named quarters (Downtown, The Palms, South Harbor,
the Foundry District), a park, a parking lot, a working harbor with piers and
open water, and the Neon Tide festival beach along the south shore: sand,
umbrellas, string lights, a stage with sweeping beams, and a slowly turning
neon ferris wheel at Pier 9.

The city keeps its own time. A six-minute day cycle rolls through day, golden
hour, dusk and night — windows light up, headlights and street lamps take
over, the festival beams cut through the dark. Rain showers pass every couple
of minutes: streaks on the screen, a deeper gloom, a sheen on wet asphalt.
Pure weather, no malice in it.

## What you do

- **11 missions.** Vera and Sal's five-job story (*Welcome to Azura*,
  *Borrowed Wheels*, *Against the Clock*, *Hot Property*, *The Big Score*),
  three post-finale jobs (*Repo Man*, *Loose End*, the *Azura Grand Prix*
  checkpoint duel), and the Dockmaster's three Pier 9 jobs (*Night Freight*,
  *Turf*, *Manifest*).
- **Side work that never runs out.** Taxi fares from the Azura Cabs stand,
  parcels for Bay City Couriers, and the occasional mugging you can interrupt
  for a Good Samaritan payout.
- **Drive anything.** Sedans, taxis, pickups, sports cars, motorcycles,
  trucks, buses — steal them parked or pull the driver out. Plus the Pier 9
  speedboat: the APD cannot follow you onto the water.
- **Fight on foot.** Fists, a pistol, and an SMG from Iron & Ivory Arms,
  with body armor that soaks most of what hits you.
- **Spend it.** Sal's respray bay ($150: new color, no stars), SMG and armor
  at the gun shop, and the Palms safehouse ($2,500) — its door saves your
  game and kills the heat.
- **Collect and conquer.** 25 hidden packages ($100 each, $1,000 for the
  full set), and the **viral stunt series**: six striped ramps, each with a
  target airtime (0.58s–0.82s). Beat one for $200 + 40 clout; beat all six
  for the $1,500 VIRAL COMPILATION bonus.

## Wanted — and watched

Crime builds **heat**; heat becomes **stars** (0–5). Cruisers route through
the street grid to ram you, officers chase on foot at three stars and up,
and standing still next to one fills the bust meter. Break line of sight
and the heat bleeds away; respray, safehouse and open water all cool you
faster. Getting caught costs 20% of your cash at the station; going down
costs 12% at Azura General.

Neon Tide adds a second pressure: **the crowd is filming.** Bystanders who
see a crime may stop and hold up a phone instead of running. A filmed crime
feeds your **CLOUT** meter — but it also builds heat 1.6× faster while the
camera is on you. Famous and wanted are the same coin here.

**CLOUT** is Azura Bay's real currency. Stunts, drifts, near misses, filmed
crimes and finished jobs raise it; lying low lets it bleed back to your last
milestone. At 120 / 300 / 600 / 1000 the sponsors call: $150 / $400 / $900 /
$2,000, and the top tier parks a gold supercar at your safehouse.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run (on foot) |
| Space | Handbrake |
| Mouse | Aim |
| Left click | Punch / shoot |
| R | Reload |
| 1 / 2 / 3 | Fists / pistol / SMG |
| E | Enter or exit a car or the boat · advance dialogue · safehouse door |
| F | Respray at Sal's · buy SMG / ammo at Iron & Ivory |
| G | Buy or repair body armor |
| Tab | Stats screen (with the minimap legend) |
| Esc / P | Pause |
| M | Mute |

Progress autosaves to `localStorage` at every milestone — missions, clout
tiers, packages, stunt ramps, purchases — and Continue picks up where you
left off.

## Architecture

Vanilla JavaScript ES modules on a single canvas. No libraries, no assets,
no network requests: every sprite is procedural canvas drawing and every
sound is synthesized WebAudio.

| Module | Owns |
| --- | --- |
| `game/src/main.js` | Game state and the loop: player, combat, wanted/busts, clout, stunt challenges, day cycle, rain, shops, ambient events |
| `game/src/world.js` | The seeded city: districts, buildings, props, beach, ramps, packages, collision, line of sight, road routing |
| `game/src/entities.js` | Cars, pedestrians, officers, thugs; the arcade car physics |
| `game/src/ai.js` | Traffic, pedestrian (and filming-witness) behaviour, police pursuit, thug combat |
| `game/src/missions.js` | The 11 missions, taxi/courier side jobs, the Grand Prix duel |
| `game/src/render.js` | All drawing: world, lighting and weather, HUD, minimap, menus, dialogue, stats |
| `game/src/audio.js` | Synthesized effects, engine and siren |
| `game/src/input.js` | Keyboard and mouse |
| `game/src/save.js` | localStorage save games |
| `game/src/shots.js` | Deterministic `?shot=start|play|beach|chase|mission&seed=N` scenes used for the screenshots |
| `game/src/rng.js` | Seeded RNG and numeric helpers |

The screenshots in `screenshots/` are real frames of the game, staged
deterministically through `shots.js` (the simulation freezes on a composed
moment, so the same seed always produces the same frame).

## Provenance

Built by an AI agent for the make.fun **gta6-01** bounty ("Make GTA 6").
The entry program is `main.ts` (Node 22, standard library only): it copies
`game/` and `screenshots/` to the output directory and writes the dossier
with the vendored make.fun library in `vendor/`, which is byte-identical
to the competition kit.

MIT licensed — see `LICENSE`.
