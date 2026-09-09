# 山中小屋 · 双剧本 M2 playable prototype

Source: 山中小屋_游戏策划案_v0.3_HD2D_100Haunt.docx, sections 5–12, 29, 31.2, 34. Uses two concept images embedded in that user-owned GDD.

Static, dependency-free browser game. `dist/engine.js` owns serializable game state and deterministic seeded RNG; `dist/app.js` owns UI, Canvas board, local storage and generated audio cues. `dist/index.html` can also be opened locally. Sites owns project identity in `.openai/hosting.json`.

Implemented: configurable 3–6 character roster and 1–N manually controlled characters; solo multi-character control or local hotseat with pass-device screens; unselected characters are AI-controlled in every phase; three floors; 24 room definitions with door rotation; 4 discrete trait tracks; 0/1/2 dice; 6 item definitions; 6 event templates; 13 omen cards; end-of-turn six-dice haunt check; fixed Haunt #2 structural adaptation; ritual competition, ghost control transfer, corpse search/carry/burial, countdown, hostile ghost/stun/banishment, peripheral room collapse, combat/death, same-room item transfer, autosave/resume and JSON session export.

Deliberate prototype adaptations, disclosed in in-game help:
- New explorer tracks and simplified card text, not full official content.
- Fixed Haunt #2 instead of the full Room × Omen mapping.
- Ritual anywhere, threshold 4, goal 3; hero success +1, traitor success +2. These are provisional test values, not final balance.
- Basement is directly linked to Grand Staircase.
- Damage automatically allocated to the eligible trait with more remaining track positions.
- Collapse selects leaf rooms to preserve connectivity; rounds with no eligible leaf do not collapse a room.
- No online multiplayer, hidden-traitor security, theft, complete room exceptions or full HD-2D renderer. Hotseat privacy is courtesy-based on a shared browser, not a security boundary.
- Gameplay visuals are a functional isometric board; GDD HD-2D artwork is used for start/reveal screens.

Validation completed: JS syntax and local asset checks; 100 seeded quick-start hero-route simulations reached terminal states; an explicit traitor-control run reached collapse, room mutation and hero victory; seeded RNG/save restore equality, card draw stops movement, pre-haunt death protection and post-death turn advance were checked. No browser visual or end-to-end QA was performed. Initial balance strongly favors heroes in quick start and needs user playtesting.


## Role selection and AI update

- Start screen independently selects team size, human-controlled count and unique cast per seat; selecting an occupied cast swaps seats. Every character shows its class and four initial traits. Classes currently distinguish attribute profiles, not additional special skills.
- `PlayerState.controller` is fixed at setup and separate from `team`. A human can remain the traitor; AI heroes remain autonomous. Human slots are first, AI fills the remainder. Local hotseat assigns one manual slot per local player; solo assigns all manual slots to the user.
- AI takes one normal action at a time: heal/pickup, find a reachable frontier and explore, choose a ritual trait, search/carry/bury remains, escort the carrier, pursue enemies, attack or banish. AI actions use the same movement budgets, dice, once-per-turn flags and victory checks. Routine AI events are logged without blocking confirmation; haunt reveals still pause for everyone.
- Version 2 saves persist controllers and in-progress AI state. Version 1 saves migrate while preserving original solo traitor-takeover behavior for those legacy games only. New role choices require starting a new game.
- Run `node tests/control-ai.cjs`: covers every supported team-size/control-count combination, unique cast validation, human-traitor ownership, legacy migration, deterministic AI save restoration, 32 full exploration games, and a forced hostile-ghost scenario. All passed. No browser QA was requested or performed.


## Skippable in-game tutorial

Default-on setup checkbox and a non-blocking in-game guide introduce the current character, traits and explore/haunt flow. Contextual advice follows actual phase, faction, AI ownership, movement/action budget, corpse custody and win state. Persistent action cues highlight the next legal action without executing it; completed tutorial concepts are suppressed for the saved game. Manual actions show state-based consequences, including room/movement changes, inventory, trait tracks, omen count and haunt checks. Floor-view changes explicitly explain that no character has moved. The player may skip at any time and reopen via the top toolbar; preference and per-save guide progress are persisted. The guide never controls the engine or blocks AI/modal handoff.

Validation: `node tests/guide.cjs` covers advice and impacts for exploration, card stop, omen comparison, AI, both factions, burial, ghost, damage and end state; advice is read-only. JS syntax checks passed. Browser QA has not been performed.


## Omen / haunt terminology update
Guide-enabled event dialogs now define omens, the shared omen counter, haunt checks and the change from exploration to faction objectives. First AI-drawn omen is retained for explanation. Every human safe haunt check shows its actual six dice, total, omen threshold and strict-less-than result independently of tutorial settings. Omen cards show no dice; the sidebar separately labels the last haunt check. Haunt reveal explains the trigger or explicitly identifies the direct-test shortcut, retained world state, new death rules and immediate objective. Dialogs can disable further guidance without interrupting turn handoff or AI. lastHauntCheck stores factual check results and a serial for presentation; dice/RNG behavior is unchanged.


## M2: dual-scenario release

Start screen selects 降魂仪式 or 命运罗网, and either normal exploration or direct-haunt entry. `dist/scenarios.js` registers scenario metadata, balance parameters and a validated prerequisite graph; rescue actions are isolated from the shared exploration/combat/save engine. This is a first reusable scenario module, not a complete RuleAtom interpreter.

Rescue source: v0.3 §31.3 and #4 in the supplied survivor/traitor manuals. Supported: restrained explorer (cannot move, can act/trade); cumulative opposed strength web attacks without retaliation; distinct, non-consumable-by-AI medical quest supplies with handoff and death drop; knowledge egg removal; prerequisite-gated front door; strength/knowledge opening; waiting until the next round before an explicit escape; spider pursuit/stun/physical damage; enemy protection for the victim before eggs are treated; multi-character control and AI; local saves; clear objective map markers and ending summary.

Explicit adaptations: lowest-sanity traitor retained for all player counts; reachable discovered room used for victim and medicine; dedicated quest medicine instead of official Medical Kit/Healing Salve; 12–15 full-round deadline based on party size continues after egg removal; spider moves one room and rolls three attack dice, no blank rerolls; victim death fails rescue; door opening removes remaining movement and escape unlocks next global round; no door event card. These differences are disclosed in in-game rules and are provisional test values, not a claim of exact official implementation.

Roll presentation: `lastRoll` and per-report immutable `rolls` snapshots bind results to the event that rolled them. Omen report intentionally has no rolls. The last haunt-check record remains separately labeled after later AI/event dice. Human check results pause for acknowledgement even when tutorials have been skipped; routine AI checks stay in logs except first-time teaching.

Validation: `tests/rescue.cjs` covers objective prerequisites, opposed-roll failure, zero-movement tasks, restraint, delayed escape, protection, medicine death drop, deterministic restore and 40 full AI games (both entry points, 3–6 characters). `tests/roll-reports.cjs` verifies no stale omen dice and exact check snapshots. `tests/ui-markup.cjs` executes rendering against a minimal host to validate both scenario markup and dice output; it is not browser or visual QA. Existing control, guide and objective tests pass. Human playtesting and final balance remain pending.
