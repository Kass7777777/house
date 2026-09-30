# S1-ENG-03 · 作祟规则冻结进存档（旧存档按旧数值打完）— 变更记录

负责人：engineering-lead（程基岩）· 依据：主理人裁定「旧存档要完整按旧数值打完」· 状态：已实现，**未提交**

## 结果
| 项目 | 结果 |
|------|------|
| 回归 `--test tests/*.cjs` | **44/44 通过**（原 37 + 新增 `tests/s1-freeze.cjs` 7 个） |
| 模拟器新局 | 默认阵容、随机阵容各 1200 局，与 `S1-balance-tuned.json` / `S1-balance-tuned-roster.json` **逐局完全一致（2400/2400，按整条局记录 JSON 比较），cells 表也一致** |
| 中性值金标（`s1-eng01-golden.json`，48 局） | 仍然一致 |
| 离线版 | 已重建 `release/山中小屋_离线版.html` |

## 做法
- **`scenarios.js`**：新增 `HouseScenarios.Rules`，包含：
  - `freeze(id)`：把剧本配置里所有规则键（除 id、title、source、summary、objectives 以外的全部键）拷成 `{scenario:id, …}`。
  - `LEGACY`：旧规则值，即 S1-ENG-01 时的全套数值：
    - ritual：threshold 4 / goal 3 / goalPerHero 0 / traitorGoal null / rounds 6 / corpseThreshold 4 / dispelGoal 3 / ghostDefense 4 / ghostMoveDice 2 / ghostAttackDice 4 / traitorRule 'lowest' / aiCautious false …
    - rescue：webDefense 4 / webGoalBase 0 / webGoalPerPlayer 1 / medicineThreshold 4 / doorThreshold 6 / spiderDice 3 / spiderMove 1 / rounds 12 / roundsPerPlayer 1 / protectUntil 'eggs' / traitorRule 'lowest'
    - seals：repairThreshold 4 / nodeGoal 2 / nodeMin 2 / nodeMax 4 / timeBase 8 / erosion 1
  - `of(g|state, id)`：如果本局的作祟就是剧本 id，返回冻结值；否则（还没作祟，或问的是别的剧本）返回实时配置。
  - `Ritual.goalsFor/span/varies` 和 `Rescue.webGoalFor/webGoalText/roundsFor/roundsText` 都新增可选参数 c（规则集），不传时用配置。
- **写入时机**：
  - `engine.startHaunt` 在挑叛徒之前写 `s.hauntRules=Rules.freeze(s.scenario)`，覆盖仪式和罗网；自动剧本模式下 `s.scenario` 已先由 tactics 决定。叛徒规则、`ritualGoals` 都从冻结值计算。
  - `seals.startHaunt` 写 `freeze('seals')`。
- **旧存档**：构造函数加载存档时，如果已作祟又缺 `hauntRules`，写入 `Rules.legacy(scenario)`，并带 `legacy:true` 标记。不消耗 RNG。探索阶段的旧存档不冻结，作祟时按当前配置冻结，这一点和 ritualGoals 的处理方式相同。
- **读取方改为冻结值**：
  - `engine`：task、summon、驱散、ghostTurn、AI 谨慎开关、叛徒规则；新增访问器 `Game.rules(id)`。
  - `scenarios`：Rescue 的 setup、actions、action、attackSpider、round、enemyAllowed、advice。
  - `seals`：startHaunt、sealActions、sealAction、roundEnd。
  - `intel`：situation、endTurn、checks。
  - `guide`：next。
  - `app.js`：`RIT()/RES()/SEA()` 改为 `HR(id)`，也就是本局冻结值，所以帮助页、简报、目标面板、状态面板、救援表、封印目标都跟着本局规则走。帮助页里的仪式目标在本局作祟后显示本局实际值；作祟前仍按人数显示「3/5/6/8」，时限说明也读本局规则。
- **比要求多冻结的两项**：`rescue.protectUntil`（旧存档恢复为「蛛卵处理后即可攻击受困者」）和 `ritual.aiCautious`（旧存档里英雄 AI 按旧逻辑攻击）。理由是「按旧规则完整打完」。若只想冻结数值，把 LEGACY 里这两项改成新值即可。
- **两处潜在报错已修**：`objectiveHTML()` 和 `priorObjectivePanel()` 在封印阶段先返回封印目标，不再抛错。

## 测试 `tests/s1-freeze.cjs`（7 个）
1. 12 份旧存档（`s1-prefix-saves.json`）加载后，`hauntRules` 等于 LEGACY，并带 legacy 标记，RNG 状态不变。数值 4/4/4/4/1 由断言校验。探索阶段的旧存档在作祟时按新配置冻结。
2. 旧仪式存档：知识掷出 4 就能找到遗骸（新规则要 6）。intel、guide、行动反馈都显示「≥ 4」。召唤报告显示「4 骰防御」「累计 3 次」。驱散时幽灵防御掷 4 骰。
3. 旧罗网存档：蛛网防御掷 4 骰；行动说明和 intel 显示「4 颗骰子」「蛛网 4 骰」「≥ 6」；蛛卵处理后、网未破时受困者就可被攻击（invoke 路径）；叛徒建议显示旧句。
4. 旧封印存档：修复掷 4 即成功；侵蚀每人 1 点；行动说明、intel checks、endTurn 预告都显示「≥ 4」「受到 1 点」。
5. 在最小宿主里渲染旧存档的帮助页和目标面板：旧文案必须出现，新文案必须不出现（3 个剧本共 26 条断言）；12 份存档全部跑到结局。
6. 新局：3 个剧本 × 快速/正常开局，冻结值都等于 `Rules.freeze(配置)`。中途改配置，以及改后再读档，都不影响本局规则和文案：仪式的搜遗骸门槛和幽灵骰、罗网的蛛网骰和保护窗口、封印的修复门槛和侵蚀。改配置后新开的局会用新配置。
7. 封印阶段的 `objectiveHTML`、`priorObjectivePanel`、`objectiveDetailPanel` 都能正常渲染。

## 改动文件
- `dist/`：scenarios.js、engine.js、seals.js、intel.js、guide.js、app.js。
- `tests/s1-freeze.cjs`（新增）、`production/eng/S1-ENG-03.md`、离线版重建（release/，被 gitignore）。
- 模拟器没改。
