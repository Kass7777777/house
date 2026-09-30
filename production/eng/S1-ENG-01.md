# S1-ENG-01 · 煤槽 / 移动加价 / 时间线 / 保护判定 / 调参配置化 — 变更记录

负责人：engineering-lead（程基岩）· 状态：已实现，待质量门禁 · 未提交（由 lead 在门禁后提交）

## 验证结果

| 项目 | 结果 |
|------|------|
| 回归套件 `--test tests/*.cjs` | **28/28 通过**（原有 17 个 + 新增 `tests/s1-fixes.cjs` 中 11 个 `test()`） |
| 新测试区分力 | 同一份 `s1-fixes.cjs` 跑在 git HEAD（4b9f0d7，修复前）上时 **11 个全部失败**，跑在修复后代码上全部通过 |
| 默认配置下 UI 文本 | 用修复前与修复后的 dist/ 渲染 help / brief / 目标面板 / 任务按钮 / 结算 / intel / guide / report，逐字节对比：**完全一致**。唯一差异是命运罗网中英雄与蜘蛛同房时「离开当前房间消耗 2 移动力」（修复前是 1）——即第 3 项的预期效果 |
| 平衡模拟（1200 局，n=50） | 0 卡死，0 不变量违例；作祟期煤槽滑落 **2314 → 0**；timeline 丢失 haunt **2 → 0**。数据：`production/qa/data/S1-balance-postfix.json` |

## 逐项说明

### 1. Bug-01（严重）煤槽里的目标 —— 已修复
- `rooms.js`：新增 `RoomRules.passThrough(r)` 与 `RoomRules.outlet(r)`，作为「不可停留房间」的唯一定义（目前只有煤槽 → `-1:0:0`）。`arrive()` 改为调用它们，行为不变。
- `engine.js path()`：过境房间既不能作路径中间点，也不能作终点（`start` 本身可以是过境房间，用于兼容旧存档）。`neighbors()` **不动**，因此玩家依旧可以主动走进煤槽并滑落；棋盘邻接和 `app.js planRoute()` 也不受影响（planRoute 按要求保持原样）。
- `engine.js summon()`（遗骸房）：仍然只做 **1 次** RNG 抽取，候选列表不变；只有抽中煤槽时才顺延到下一个候选（循环）。没有抽中煤槽的种子，结果与修复前完全相同。
- `scenarios.js Rescue.setup`（巢穴 / 受困者 / 补给点）、`seals.js startHaunt`（封印节点）：候选中显式排除过境房间（改后的 `path()` 本身也会排除它）。这两处本来就不消耗 RNG。
- 安葬点的兜底 `-1:0:0` 和墓穴都不可能是煤槽，不需要改。
- **旧存档修复**：`engine.js` 新增 `repairPassThrough()`，加载存档时（`new Game({}, saved)`）调用。旧存档里凡是落在煤槽的对象（遗骸、补给、蜘蛛、幽灵、受困者或任何玩家）都移到煤槽出口 `-1:0:0`；封印节点也移到出口，若出口已经是另一个节点，就选下一个最远的可达房间。不消耗 RNG；对不涉及煤槽的存档不做任何改动。

### 2. Bug-02 AI 反复滑落 —— 随 1(b) 一并消除，并加了守护测试
- 根因是 BFS 把煤槽当成普通的双向节点：AI 走进去就被传送，下一步又规划回去，形成循环。`path()` 修好后，所有 AI 路径都随之修正：探索 AI、幽灵、蜘蛛、叛徒追击、救援与封印的分工、guide 的路线建议。
- 测试 `AI never enters 煤槽 during the haunt`：挂钩 `RoomRules.arrive`，用 216 局完整 AI 对局（2 种人为布局 × 3 剧本 × 4 种人数 × 6 局，外加正常开局 72 局）统计作祟期的滑落次数，结果必须为 0；每一步都断言没有任何对象位于煤槽。

### 3. `cost()` 的蜘蛛加价被覆盖 —— 已修复
- `engine.js cost()`：原来的 `n=` 改为 `n+=`，加价变为可叠加：蜘蛛 +1（仅对英雄，且蜘蛛未被击退）+ 每名同房敌人 +1 + 敌对且未被击晕的幽灵 +1。
- `app.js costFrom()/planRoute()`、`board.js`（`cost: game.cost()`）、`guide.cue()` 和 `Rescue.advice()` 都直接调用 `game.cost()`，路线报价与提示会自动同步，无需改动。

### 4. Bug-03 时间线挤掉 haunt —— 已修复
- `engine.js milestone()`：上限仍为 100 条，但裁剪时跳过 `start` 和 `haunt`，只删除最老的其他条目。playlog 的「作祟轮」因此总能找到锚点。

### 5. Risk-04 保护判定重复实现 —— 已修复
- `equipment.js P.attack` 的内联判断 `!eggs && t.id===victim` 改为调用 `S.Rescue.enemyAllowed(this,t)`，每次调用时实时查找属性，所以模拟器 `--cf=protect-freed` 这类运行时替换也会生效。`engine.js attack` 本来就调用它。现在受困者保护只有这一处定义。

### 6. 调参配置化 —— 已完成（默认值等于原值，行为不变）
新增的配置字段：

| 剧本 | 字段（默认值） | 读取位置 |
|------|----------------|----------|
| ritual（`scenarios.js`） | `corpseThreshold 4`、`dispelGoal 3`、`ghostDefense 4`、`ghostMoveDice 2`、`ghostAttackDice 4`（原有：`threshold 4`、`goal 3`、`heroGain 1`、`traitorGain 2`、`rounds 6`） | engine `task/summon/attack/ghostTurn/startHaunt` |
| rescue（`scenarios.js`） | `webGoalBase 0`、`webGoalPerPlayer 1`（webGoal = max(1, round(base + per×人数))）、`roundsPerPlayer 1`（时限 = rounds + (人数−3)×roundsPerPlayer）；`doorThreshold`、`medicineThreshold` 原本就在配置中，现在失败提示文本也读取它们 | `Rescue.webGoalFor / roundsFor / webGoalText`、`setup`、`action` |
| seals（`seals.js`） | `repairThreshold 4`、`nodeGoal 2`、`nodeMin 2`、`nodeMax 4`（节点数 = min(nodeMax, max(nodeMin, 人数−1))）、`timeBase 8`、`erosion 1` | seals `startHaunt/sealActions/sealAction/roundEnd` |

- 以下玩家可见文本已改为从配置插值，措辞保持不变：`engine.js`（作祟、召唤、仪式、搜遗骸、驱散的报告和日志）、`scenarios.js`（蛛卵、开门的失败提示）、`seals.js`（开场报告、修复说明、检定文本、侵蚀日志）、`intel.js`（situation / endTurn / checks）、`guide.js`（仪式、驱散、搜遗骸建议）、`awareness.js`（「x / 3」进度行）、`app.js`（帮助页、简报、目标面板、任务按钮、结算、状态面板、救援表、封印目标）。`app.js` 顶部新增 `RIT()/RES()/SEA()` 实时读取配置，`CN()` 用于「三次驱散」这类中文数字。
- **未纳入**（不属于剧本参数）：作祟检定的 6 颗骰、宝库和塌陷房间的 ≥4、事件门槛（tactics.js 事件表已自带 threshold）、崩塌规则（每轮 1 间、1 点伤害、受保护房间）、封印属性交替、事件 / 宝库的 ≥4。崩塌相关数值是下一轮配置化的首选，需要时告知即可。
- **平衡模拟器（最小改动，文件归 QA）**：`--set=<剧本>.<键>=<数值>` 现在可以写入配置里任何数值字段，包括所有新字段。保留旧别名：`seals.time=Δ` 在 timeBase 上加 Δ，`seals.goal` 映射到 nodeGoal，`seals.erosion` 现在直接写配置（与旧的乘法语义在基数 1 时等价）。删除了原先猴补 `startHaunt` 和侵蚀伤害乘数的 hack。报告里的起始时限改为 `Rescue.roundsFor(count)` 和 `seals.timeBase + count`。`--fix-chute` 已过时，仅为复现 S1 的估算而保留。已验证：`--set=ritual.dispelGoal=4`、`--set=seals.time=-3 --set=seals.goal=3 --set=seals.erosion=2` 生效（起始时限 9，goalSum 9，侵蚀伤害翻倍）；未知键仍会报错。

### 7. 测试（`tests/s1-fixes.cjs`，11 个）
1. 快速开局 + 人为放入煤槽（「最远死胡同」和「双向捷径」两种布局）× 200 种子 × 3 剧本 × 3–6 人：没有任何目标或棋子位于煤槽；仪式剧本中每名英雄各召唤一次，遗骸房都不在煤槽。
2. 遗骸抽取：逐一枚举每个抽取下标——只消耗 1 次 RNG，抽中煤槽时顺延到下一个，其余下标结果不变。
3. 正常开局：200 种子 × 3–6 人，由 AI 真实探索到作祟揭晓的那一刻，再分别以 3 个剧本重放揭晓，外加仪式召唤；0 次违例（至少 50 张探索出的地图含煤槽，确认覆盖）。
4. `path()` 在所有房间对之间都不经过煤槽；存在捷径时会绕行；人类玩家仍可主动进入并滑到 `-1:0:0`。
5. Bug-02 守护：见第 2 项。
6. `cost()`：只有蜘蛛 = 2，蜘蛛加叛徒 = 3，蜘蛛被击退 = 2，只有叛徒 = 2，叛徒不受己方蜘蛛影响 = 1。
7. 时间线写入 180 条后：长度仍为 100，第 0、1 条是 start 和 haunt，保留最新条目，endGame 后依然成立，`Playlog.row().hauntRound` 正确。
8. 保护判定：直接调用与 invoke（equipment 分支）两条路径都经过 `Rescue.enemyAllowed`（替换该谓词后两条路径同时生效）。
9. `ritual.dispelGoal=4, ghostDefense=5`：3 次驱散不再获胜、第 4 次获胜，幽灵抵抗掷 5 骰；召唤报告、intel、guide 文本同步变化。另外改动 `goal/threshold/traitorGain` 后，揭晓报告、intel、guide 文本也同步变化。
10. seals（repairThreshold / nodeGoal / timeBase / erosion）和 rescue（door / web / medicine / webGoal / roundsPerPlayer）的规则与文本都随配置变化；默认措辞仍为「队伍人数」。
11. 存档：当前构建的对局做中途 JSON 往返后能跑完；另有 **修复前构建真实生成的存档**（`tests/fixtures/s1-prefix-saves.json`，由 git HEAD 4b9f0d7 生成，其中 6 份的目标位于煤槽：巢穴 / 补给、封印节点、遗骸；另 6 份是普通的作祟中局），用新代码加载后煤槽中的对象被修复、RNG 状态不变，并全部跑到结局。

## 对现有种子的 RNG 顺序影响
- **不涉及煤槽、非命运罗网的对局：零漂移**。与 `S1-balance.json` 按种子逐局对比（胜方、结束轮、步数）：ritual quick、seals quick **400/400 局完全相同**。正常开局中，修复前作祟期没有发生滑落的对局，ritual 有 170/187 局、seals 有 147/161 局完全相同；其余对局在探索期发现了煤槽，AI 的探索路线因此改变。
- **煤槽已被发现的对局**：从煤槽影响 AI 决策的那一刻起发生分歧。探索 AI 不再去开煤槽上的门，也不再穿过它；作祟期的路径与距离排序改变，巢穴、封印等可能换到另一个房间。遗骸抽取的 RNG 消耗次数不变，只有抽中煤槽时才会不同。
- **命运罗网**：英雄在蜘蛛所在房间开始移动时，移动预算少 1，AI 路线随之改变，对局从那里开始分歧（quick 与 normal 都会受影响）。
- 时间线裁剪、配置化（默认值）、加载时修复：都不消耗 RNG。

## 新的调参基线（英雄胜率 %，n=50/格，默认阵容）

| 剧本 | 入口 | 3 人 | 4 人 | 5 人 | 6 人 | 合计 |
|------|------|-----|-----|-----|-----|------|
| ritual | quick | 88 | 94 | 100 | 100 | 95.5 |
| ritual | normal | 80 | 96 | 96 | 100 | 93.0 |
| rescue | quick | 16 | 60 | 46 | 62 | 46.0 |
| rescue | normal | 24 | 36 | 46 | 62 | 42.0 |
| seals | quick | 100 | 100 | 100 | 100 | 100 |
| seals | normal | 100 | 100 | 100 | 100 | 100 |

与修复前（`S1-balance.json`）对比：ritual normal 89.5 → 93；seals normal 83.5 → 100（修复前的失败几乎全部来自煤槽）；rescue 合计 44.8 → 44.0。
命运罗网归因（临时恢复旧 `cost()` 重跑，只保留煤槽修复）：3/4/5/6 人的英雄胜率分别为 quick 12/60/48/74、normal 22/40/48/72。可见 **蜘蛛加价在 6 人局让英雄胜率约下降 10–12 个百分点**，其他人数的变化在 n=50 的噪声（约 ±7）以内。

## 有意未做 / 需知会
- `neighbors()` 保持双向，没有把煤槽建模成 AI 可以利用的单向捷径（去地下室的滑道）。这属于 AI 能力增强，不在 bug 修复范围内。
- `design/gdd/systems/*.md` 第 7 节「位置」列里的行号已经过时，写死的数值现在都有了配置键，需要由设计负责人更新（本任务要求不联系其他队友，所以没有通知对方）。
- `release/山中小屋_离线版.html`（被 gitignore）是旧构建，发版前需要跑 `tools/build-offline.cjs` 重新生成。
- 工作区的换行符本来就混杂（index 里是 LF，core.autocrlf=true）。本次编辑保留每个文件原有的 EOL，`git diff` 中只有实际改动的行。新文件使用 LF。
