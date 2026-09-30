# 山中小屋 · 三剧本 M3 playable prototype

Source: 山中小屋_游戏策划案_v0.3_HD2D_100Haunt.docx, sections 5–12, 29, 31.2, 34. Uses two concept images embedded in that user-owned GDD.

Static, dependency-free browser game. `dist/engine.js` owns serializable game state and deterministic seeded RNG; `dist/app.js` owns UI, Canvas board, local storage and generated audio cues. `dist/index.html` can also be opened locally. Sites owns project identity in `.openai/hosting.json`.

Implemented: configurable 3–6 character roster and 1–N manually controlled characters; solo multi-character control or local hotseat with pass-device screens; unselected characters are AI-controlled in every phase; three floors; 26 room definitions with door rotation; 4 discrete trait tracks; 0/1/2 dice; 6 item definitions; 12 choice-event templates; 13 omen cards; end-of-turn six-dice haunt check; fixed Haunt #2 structural adaptation; ritual competition, ghost control transfer, corpse search/carry/burial, countdown, hostile ghost/stun/banishment, peripheral room collapse, combat/death, same-room item transfer, autosave/resume and JSON session export.

Deliberate prototype adaptations, disclosed in in-game help:
- New explorer tracks and simplified card text, not full official content.
- Three-scenario prototype Room × Omen mapping, with a separate fixed-scenario test mode; not the official full matrix.
- Ritual anywhere, threshold 4, goal 3; hero success +1, traitor success +2. These are provisional test values, not final balance.
- Basement is directly linked to Grand Staircase.
- Human damage is allocated interactively across physical or mental traits; AI keeps automatic allocation.
- Collapse selects leaf rooms to preserve connectivity; rounds with no eligible leaf do not collapse a room.
- No online multiplayer, hidden-traitor security, complete room exceptions or full HD-2D renderer. Hotseat privacy is courtesy-based on a shared browser, not a security boundary.
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


## Complete-session exploration batch

Added reusable `dist/rooms.js`: vault knowledge checks with one attempt per turn and a shared one-time reward; first-discovery collapsed-room speed check with optional later jump; coal chute transport on every entry. Prototype adaptations: falls/jumps go to the existing lower-floor platform, with no damage or generated return connection. New room deck entries require a new game.

Players can inspect item effects and choose which trait a healing kit restores. Turn handoffs retain a collapsible recent-change review; AI pace can be adjusted. A session recap records role activity and key milestones, survives saves, and is available during play and at the ending. Same-team replay returns to setup with the roster retained and a fresh map seed. Older saves explicitly mark partial statistics.

Validation: room-session tests cover vault failure/retry/single reward, recurring chute transport, collapsed-room checks/jump cost, healing choice validation and save persistence. Existing scenario, controller, objective, guide, dice and minimal-host rendering tests pass. No browser visual QA performed; human playtesting remains the next gate.


## Exploration decisions and tactical resolution
Normal setup defaults to hidden scenario selection. `tactics.js` defines an explicit 26-row/13-column two-scenario prototype matrix; only successful haunt checks reveal the selected scenario. Last omen room and identity are saved. Fixed scenario tests remain available; legacy saves retain their original fixed scenario.

Four authored event prompts offer investigation (trait >=4, +1 trait and one available item; failure 2 damage), safe retreat, consumable-assisted safety, or same-room ally support. These are original prototype events, not official card reproductions. Events block other gameplay until resolved and survive reloads. AI chooses using its abilities and resources.

Every UI/AI gameplay command that may cause damage runs through `Game.invoke`. Human damage suspends the entire atomic command: saved baseline, ordered allocations and immutable dice evidence allow deterministic replay once the player confirms. This preserves exact RNG, enemy/round continuation, death and victory ordering even for multiple victims. Direct low-level methods retain automatic damage for legacy headless callers. Pending allocations save safely. Attack confirmation explains both dice pools, retaliation and the attack budget.

AI medicine assignment considers route distance and knowledge; a carrier can hand off to a stronger same-room medic. Party cards display live AI goals. Also corrected spider movement-blocking cost being overwritten by ordinary enemy count.

Validation: `node --require ./dist/tactics.js --test tests/*.cjs` includes the live extension in all regression simulations. New coverage checks mapping, event choice locking, save/replay allocations, enemy attacks on humans, and 12 complete automatic-selection games spanning both scenarios; UI host tests execute choice and allocation clicks. No browser visual QA was performed. Human pacing/balance feedback remains required.


## Team and session awareness
Added a central phase/goal/deadline and turn-order display, persistent recent-action feed, detailed dice-backed action history, and an expanded human-turn briefing prioritizing trait changes and objectives. AI normal pacing is 1.1 seconds, with fast/slow, pause and single-step controls. Structured change records are generated only after atomic commands commit, so pending damage and save/replay do not emit duplicate outcomes. History keeps the last 100 changed commands and persists in local saves; old saves begin recording from this update. Presentation does not consume RNG or alter turn rules. Targeted tests cover pending damage, resumed single emission, actor/dice preservation and handoff markup.


## Compact current-state layout
Supersedes the preceding awareness layout: removed visible recent-party-action and handoff-brief panels, compressed the phase header to current/next actor, and folded the sole House Chronicle history panel by default. A centralized faction-aware objective panel lists prerequisites, progress, deadlines, carriers and floor-qualified location links. Every character can be inspected for trait values, inventory, critical states and AI intent without changing the active actor. Map location highlights are distinct from current-character highlighting. Existing dice/atomic action rules remain unchanged. VM markup checks cover removed panels, rescue prerequisites, inspection and cross-floor location without actor mutation.


## Readable event pacing and objective status
House Chronicle defaults open. Party cards expose all four attributes and AI goals. Rescue objective cards show parallel rescue/medical status, locations, missing prerequisites and a factual situation summary; other haunt phases summarize remaining progress.
AI informational results default to explicit acknowledgement independent of tutorials. Automatic reading waits 4.5–15 seconds based on text length, while fast mode skips routine AI report pauses. Death, phase transitions and key completions remain acknowledged. Modal visibility blocks subsequent AI commands; reports persist through saves. A single atomic round-end command may contain multiple effects, which are shown together in its result. No animation work or rule changes in this batch.
Validation: controller, guide, objectives, rescue, dice, damage/reload, awareness and UI host regression suites passed. Actual browser visual testing was not performed.

### 单局信息（v17）
目标栏统一展示当前阵营目标和胜负风险。操作区可展开「行动说明」，查看实际骰数与失败代价；结束回合前可看到下一位及轮末结算预告。房屋纪事默认展开，可筛选本轮或关键记录。AI 自动阅读可停留，最后三轮的时限变化即使快速模式也需要确认。结局回顾保留具体结束原因。


### v20 · 封印之夜完整合作剧本
新增原创无叛徒合作场景：2–4 个已发现可达房间作为封印点，每处需要两次指定知识/理智总和 ≥4；每人每回合一次。修复点成为免疫侵蚀的安全房间。从作祟后的下一轮末起，安全房间外角色受到精神/物理交替的 1 点伤害。8＋人数轮倒计时，全点完成后需由一位英雄在入口主动撤离。AI 分工、地图标记、情境引导、存档及合作失败结果均接入。作为分散仪式结构验证，不是官方 #44 或其他手册剧本的复刻。

执行完整规则回归：`node --require ./dist/tactics.js --require ./dist/equipment.js --require ./dist/seals.js --require ./dist/awareness.js --test tests/*.cjs`。封印之夜快速开局目前偏易，平衡仍待真人试玩；验证只覆盖程序化规则与界面模板，未做真实浏览器视觉验收。


### v21 · 本地可运行版、声音样板、试玩数据表
**本地运行（任选一种，详见 `本地运行说明.txt`）**
- Windows：双击 `Start-Game.bat`。它用系统自带的 PowerShell（`tools/serve.ps1`，HttpListener）在 `localhost` 起静态服务并打开浏览器，不用装 Python / Node。端口从 4173 起自动找空闲的；玩的时候别关那个窗口。
- 单文件：`node tools/build-offline.cjs` 生成 `release/山中小屋_离线版.html`，CSS / JS / 压缩后的概念图全部内联，约 1.4 MB，双击即玩。图源在 `tools/offline-assets/`（原 PNG 2.6 MB → JPEG 约 300 KB）。`release/` 不入库，改完 `dist/` 重新生成。
- macOS / Linux：`sh start-game.sh`（python3）。原来的 `python3 -m http.server 4173 --directory dist` 依然可用，`dist/index.html` 直接双击也能跑。
- 存档按「浏览器 + 地址」隔离：localhost、file:// 和线上地址是三份互不相通的存档。

**声音（M3 的声音部分）**：`dist/audio.js`，Web Audio 实时合成，没有音频文件。
- 音乐：低频 drone 加八音盒动机，随阶段换层：开始页 / 探索 / 作祟后叠三全音层和心跳 / 时限最后三轮心跳加快、加钟摆声；结局时 drone 收掉。
- 环境：风（带通噪声 + 随机阵风和声像）、房间底噪、木构吱呀；作祟后偶发远雷。
- 交互：脚步、开门揭示、抽事件、拾取、骰子、属性成长、目标进度、受伤、死亡、预兆钟、作祟 stinger、崩塌、倒计时、轮到你、胜利、失败。三路各自带混响，推子同时控制干湿声。
- 触发方式：每次 `render()` 后对 `game.s` 取只读快照并与上一帧做差分（`HouseAudio.pure.snapshot / cues / mood`）。不改引擎、不调用游戏 RNG；声音随机只用 `Math.random`。换局或读档不会补播旧事件。作祟那一刻只播 stinger，压掉同帧的脚步和开门。
- 「声音设置」在开始页和顶栏：开关、总音量 / 音乐 / 环境 / 交互四路推子、十个 cue 试听。设置存 `localStorage['house-audio']`，默认关闭。首次点击页面之前不会创建 AudioContext，避开浏览器自动播放限制。
- 电平只做了数值检查：总线上各 cue 峰值约 0.07–0.58（作祟最高），无削波。还没有经过真人试听，音色和响度比例需要听感调整。

**试玩数据表**（交接文档「建议的下一轮大批次工作」第 3 条）：`dist/playlog.js`。
- 每局结束自动记一行到 `localStorage['house-playlog']`，同一局只记一次，最多保留 300 行。
- 开始页「试玩数据」：按剧本汇总局数、英雄胜率、平均轮数、平均死亡，并列出最近 60 局；可导出 22 列 CSV（带 BOM，Excel 直接打开），含日期、剧本、入口、揭晓方式、人数、手动数、种子、作祟轮、结束轮、胜方、原因、叛徒、死亡角色、剩余道具、行动数、用时等。
- 作祟轮取 timeline 里的 `haunt` 里程碑。命运罗网推进回合时不更新 `s.hauntRound`，不能拿它反推。

**修复**
- 伤害分配卡死：玩家把某项属性分到跌出轨道（死亡）后，剩余点数无处可分，两个属性按钮都禁用，「确认分配并继续结算」也没反应。原因是 `damageConfirm` 只在 `confirmDamage()` 返回真时关窗，而这条路径下事务已经结算、返回值为假。现在只要挂起决策已清空就关窗继续。由本轮浏览器整局 QA 发现。
- 补 favicon，消掉每次加载的 404。

**验证**
- Node 回归 16/16：新增 `tests/audio-playlog.cjs`（快照只读、不耗 RNG、整局 cue 覆盖、作祟优先、倒计时、死亡 / 胜负、设置容错、记录幂等、CSV 转义、三剧本作祟轮）和 `tests/offline-build.cjs`（无外部引用、脚本顺序、图片内联、启动脚本可执行）；`ui-markup.cjs` 改为加载新模块并检查开始页入口。
- 真实浏览器整局 QA（headless Chromium，走真实 UI：弹窗按钮、伤害分配随机点属性、人类席位用 AI 决策代打）：60 局全部打到结局，控制台 0 报错，每局都在数据表里只记一行。覆盖三剧本 × 3/4/5/6 人 × 单手动 / 全手动 × 快速开局 / 正常探索（全手动的正常探索走本地多人交接），外加 12 局「探索中揭晓」（揭晓为降魂仪式 1、封印之夜 7、命运罗网 4）。修复前，伤害分配卡死在这套矩阵里稳定复现。
  - 这批 AI 代打局英雄胜率：降魂仪式 15/16、命运罗网 12/16、封印之夜 16/16，探索中揭晓 7/12。和交接文档「快速开局偏英雄、封印之夜偏易」的判断一致；AI 对 AI 不代表真人强度，只作为调参前的基线。
- `file://` 直开、单文件离线版、PowerShell 服务（MIME、404、路径穿越拦截）都在浏览器里跑通了开局、存档和读档入口。
- 没做的：真人试听和试玩、移动端细调、线上发布。本次没有改 `.openai/hosting.json`，也没有推送到 GitHub。


### v22 · 表现层打磨（棋盘、标题、单屏界面、演出）
目标是让第一眼和每一回合的手感接近成品独立游戏。只动表现层：规则、存档格式、RNG 顺序都没变。

**新棋盘 `dist/board.js`**（替换原来的平面菱形，`drawMap()` 优先调用它，失败时回退旧绘制）
- 房间：按房间名分配地板材质（木地板 / 粗木板 / 石砖 / 黑白棋盘格 / 地毯 / 温室草地），带侧面厚度；西、北两侧画矮墙，有门处留门洞；东、南侧画门槛。材质按缩放级别缓存。
- 家具：26 种房间各配一组程序绘制的道具（书架、祭坛与蜡烛、棺材、钢琴、锅炉、镜子、望远镜、宝箱、楼梯、吊灯、瓦砾等），部分自带光源（烛火、锅炉、试剂、宝箱）。
- 光照：整层先压暗，再按角色、当前房间、道具光源挖出光区，叠一层暖色加亮；作祟后整体偏冷、偶发闪电，时限最后三轮边缘泛红脉动。另有浮尘粒子和缓慢漂移的雾。
- 角色：立体小人（阴影、渐变身体、编号），当前角色有地面光圈和头顶指示；受困画蛛网，携带遗骸有光球。移动时在房间之间补间滑行。
- 敌人与目标：幽灵、蜘蛛是动画精灵；遗骸 / 安葬 / 救援 / 医疗 / 前门 / 封印 / 撤离都用光柱加标签标注。**顺带补上了封印之夜在地图上的封印点标记**：旧版图例写了，但从未画出来。目标在其他楼层时，底部提示「其他楼层还有目标 · 地下 ×2」。
- 交互：悬停高亮并显示提示（能否移动、消耗、在场角色、地面物品）；滚轮缩放、拖动平移、双击复位；地图比屏幕大时镜头跟随当前角色。属性变化和获得物品时，在角色头顶飘字，受伤时轻微震屏。
- 新房间揭示时从上方落下淡入。1080p、12 个房间约 60 fps。系统或设置里开启「减少动态」时，关闭补间、粒子、闪电和过场。

**界面 `dist/shell.js` + `dist/shell.css`**（包装 app.js 的 render / act / report / setup，不改原逻辑）
- 标题画面：概念图缓慢推镜、雾层、上升的光尘；菜单为继续上次对局（显示轮数与剧本）/ 新的探索 / 设置 / 试玩数据 / 规则说明 / 制作说明。组队页加了返回标题。
- 单屏布局：宽度 ≥1100、高度 ≥640 时整页不再滚动。两侧栏各自滚动，地图占满中间；回合状态、楼层切换、新手引导、行动结果都改成浮在地图上的卡片；行动栏停靠底部，分成「行动」和「结束回合」两栏，结束回合按钮始终可见。
- 顶栏只留 AI 暂停 / 速度 / 事件阅读、声音、设置、菜单，其余进暂停菜单。
- 暂停菜单（Esc）：继续、设置、对局回顾、规则、重开引导、快捷键、导出日志、保存并返回标题。菜单和设置打开时 AI 不行动。
- 设置分三页：游戏（AI 节奏、事件阅读、默认引导）、显示（界面缩放 90–125%、屏幕震动、减少动态）、声音（原四路混音）。存 `localStorage['house-settings']`。
- 快捷键：WASD / 方向键移动，空格结束回合，F 镜头回到角色，1 / 2 / 3 切换楼层，P 暂停 AI，Esc 菜单，H 快捷键表。

**演出**
- 作祟过场：揭晓时整屏标题卡（剧本名、一句话目标）加白闪和震屏，约 3.6 秒，点击可跳过。
- 轮到手动角色时，地图中央出现「某某的回合」横幅（轮次、剧本、移动力、阵营）。
- 弹窗淡入上移；骰子依次翻滚落定后再显示总和；结局标题加大。

**验证**
- Node 回归 16/16。`ui-markup.cjs` 改为先检查标题画面，再进入组队页；最小宿主下加载 board.js、shell.js 不报错。
- 真实浏览器 60 局整局矩阵（改完表现层后重跑）：60 局全部打到结局，控制台 0 报错，每局在数据表中只记一行。
- 视觉验收截图：1920×1080、1600×900、1366×768、1280×800（Steam Deck 分辨率）；390 宽手机仍用原来的滚动布局，可用但没专门优化。
- 单文件离线版已包含新模块（1.47 MB），`file://` 打开标题画面、背景图、棋盘均正常。
- 仍需真人判断：光照明暗和材质是否耐看、过场时长、横幅频率是否打扰。


### v23 · 先看移动，再看事件；文本与交互整理
**节拍（`app.js` 的 `stage()` / `flushBeat()`，`board.js` 的 `busyMs()` / `cue()`）**
- 以前 AI 一走进房间，结算弹窗立刻盖住地图，看不到它去了哪。现在角色先在地图上走完（固定时长补间，带小跳步，0.42–0.95 秒），新房间落定，头顶冒出气泡说明发生了什么（「◆ 预兆 · 黑羽」「✦ 获得 旧斧」「！ 摇晃的吊桥」「⚄ 作祟检定」），停约 0.5 秒后才弹窗。
- 适用于 AI、同机队友和你自己：你自己走进有事件的房间，也是先看到房间落下，再弹事件选择。伤害分配、交接设备、结局画面同样排在动画之后。
- AI 下一步也会等上一步走完（快速节奏下每步至少等补间结束），多步移动能一格一格看清。AI 在权衡事件时，头顶显示事件名。
- 等待期间点击任意按钮或按键，会立刻跳过等待、直接弹出结果，这次点击本身不会生效，避免误操作。单次等待最长 1.4 秒。
- 「减少动态」开启、或没有棋盘时，一切照旧同步执行（Node 测试宿主就是这种情况）。
- AI 回合开始时也有一条较小的横幅「某某的回合 · 电脑 AI 行动中」；横幅改为居中在引导面板右侧的可见地图区域，不再压住引导。

**AI / 队友行动弹窗**
- 抬头改成行动者（带颜色点）「林默 · 电脑 AI 的行动」，下面一行是位置和轮次，正文是发生的事，底部列出移动和属性变化；去掉和正文重复的行。
- 「AI 事件」阅读方式默认改为「自动继续」（弹窗停留一会儿后自己关闭），三档改名为逐条确认 / 自动继续 / 只看关键，设置里写清了各自含义。

**文本**
- 13 个预兆各有一句描述，抽到时显示在规则说明上方，背包里也能看到；原来是「此验证版不附加独立能力」。
- 12 个事件的每种应对方式改成具体动作（「轻巧地跨过 · 速度」「研究锁芯 · 知识」），不再是「冒险调查 / 换一种方法」；成功和失败各有一句结果描写。
- 预兆提示改成第三人称（原来 AI 抽到也写「你获得了预兆」），并缩短。
- 去掉玩家能看到的开发用语：「验证版」「PLAYABLE PROTOTYPE」「三剧本原型映射」「这个 Demo」「本次简化坠落」「原创验证，不是官方剧本复刻」「直接测试作祟」。「直接测试作祟」统一叫「快速开局」。
- 组队页：「剧本 · 随机（探索中揭晓）/ 指定剧本」，剧本卡标签改为「合作 · 没有叛徒 · 限时」等；底部说明改成内容概览。
- 引导里「点击虚线框中的『＋』」改为「?」（棋盘上画的是 ?）；死亡统一说「跌出轨道」，不再混用「骷髅」。
- 地图图例按阶段显示，探索阶段不再列遗骸、安葬、幽灵。结束回合旁的提示改成剩余移动力，不再是「离开当前房间消耗 1 移动力」。探索阶段不再提「不扣减时限」。

**交互**
- 顶栏去掉「AI 正常」「事件：确认」两个按钮（在设置里），只有有 AI 时才显示暂停 AI。
- 引导第一步不再在「下一条」按钮上再套一层「↓ 点击这里」提示框。
- 事件弹窗里不可用的应对方式缩小变淡，可选的更显眼。弹窗默认聚焦主按钮（可用时），回车即继续。
- 左侧队伍卡片的三个按钮压成一行。

**验证**
- Node 回归 17/17，新增 `tests/staging.cjs`：动画时弹窗延后、点击跳过且不生效、AI 等补间、离开对局清掉节拍、减少动态下保持同步。
- 浏览器 60 局矩阵（减少动态，走逻辑路径）：60 局全部打到结局，控制台 0 报错，每局只记一行数据。
- 浏览器 9 局动画矩阵（开动画、AI 快速节奏、三剧本、快速开局 + 正常探索）：9 局全部打到结局，0 报错，平均每局约 29 秒。
- 实测时序：AI 走进房间约 1.1 秒后开始走，约 2.4 秒弹窗；中间约 1.2 秒是补间加气泡。AI 相邻两步的间隔中位数约 0.2 秒（快速节奏），最长约 1.9 秒。


### v24 · 点击远处房间直接走过去；移动时不剧透
**多格移动**（`app.js` 的 `planRoute()` / `walkStep()`，`board.js` 的路线预览）
- 移动力够时，点击地图上任意一间已发现的房间，角色会沿最短路线一格一格走过去。每一步都调用引擎原有的 `moveRoom`，所以扣移动力、进房结算、日志和存档都和手动一格格点完全一样，规则没改。
- 路线按引擎的实际费用计算：离开有敌人（或未击晕的幽灵、蜘蛛）的房间要多花移动力，路线会绕开或如实计价。煤槽不作为途经点（进去会滑到地下）。楼梯和平台之间的跨层连接照常可走。
- 鼠标悬停在远处房间上：地图画出虚线路线和途经点，终点标「5 步 · 消耗 5」；移动力不够时路线变红，写「需要 6 · 剩 4」，点击不会移动，只在地图下方提示原因。相邻房间仍是一次点击走一格。
- 途中会自动停下的情况：走进的房间抽到卡牌（移动力归零）、弹出任何结算、回合或局面变化、有等待中的演出。途中点击任意位置会立刻停住，这一下点击本身不生效。
- 走完后右下角的行动结果卡写整段路线「从长廊走到音乐室，共 5 步。剩余移动：5 → 0」，而不是只写最后一步。
- 只对已发现的房间生效；未知的门仍要点 ? 一格一格探索，不会替你开门。AI 的移动方式不变。

**移动时不剧透**
- 去掉 v23 加的头顶气泡：角色走的时候头上不再预先写出「预兆 · 某某」。
- 拾取物品、属性变化的飘字推迟到角色走到房间之后才出现。
- 走动和等待期间，右侧目标栏、房屋纪事、预兆计数、行动结果卡和底栏的房间说明会淡化模糊，结果弹出后再恢复；否则纪事里会先写出「预兆：陌生人的肖像」。

**验证**
- Node 回归 17/17，`staging.cjs` 增加多格移动用例：路线与费用、移动力不足拒绝、敌人加价与引擎一致、绕开煤槽、无动画时同步走完、有动画时逐格走且点击即停、停下的点击不生效；以及移动时没有头顶气泡。
- 浏览器实测：从长廊点音乐室，5 步、消耗 5 移动力，逐格走到，无报错。
- 浏览器矩阵：逻辑路径 60/60、开动画 9/9，全部打到结局，0 报错。
