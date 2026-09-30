# 山中小屋 · 设计文档索引

- 基线：代码 v24（提交 `4b9f0d7`），2026-09-30
- 维护：文策渊（设计 + 叙事）
- 原则：规则以 `dist/` 代码为准；文档里所有数值都标了代码位置，改代码时请同步改对应文档的「调参旋钮」表。

## 概念

| 文档 | 内容 |
|------|------|
| [game-concept.md](game-concept.md) | 设计支柱、核心循环、MDA 快照、目标玩家与时长、范围分层、5 个最大设计缺口、代码与 README 的出入 |

## 平衡

| 文档 | 内容 |
|------|------|
| [balance/S1-tuning-proposal.md](balance/S1-tuning-proposal.md) | S1 调参提案：三剧本数值、罗网保护窗口、仪式按英雄数缩放、叛徒选取四选项对比、程序实现清单、S2 待办。状态：待主理人拍板 |

## 系统

| 系统 | 文档 | 状态 |
|------|------|------|
| 探索与卡牌 | [systems/exploration-and-cards.md](systems/exploration-and-cards.md) | 已实现，规则稳定；内容量偏少（6 道具、13 预兆无效果），探索期偏短 |
| 作祟触发与翻面 | [systems/haunt-trigger.md](systems/haunt-trigger.md) | 已实现；平均第 2.8 轮翻面，偏快；叛徒选取是确定性的（罗伊在场几乎必为叛徒） |
| 属性、检定、伤害与战斗 | [systems/traits-and-damage.md](systems/traits-and-damage.md) | 已实现，规则稳定；角色只有属性差异，初始合计 15–17 不等 |
| 剧本 · 降魂仪式 | [systems/scenario-ritual.md](systems/scenario-ritual.md) | 可完整游玩；竞速严重偏英雄（4 人以上 100%），叛徒分支几乎不出现；无人数缩放；遗骸在煤槽时必输 |
| 剧本 · 命运罗网 | [systems/scenario-rescue.md](systems/scenario-rescue.md) | 可完整游玩，胜负有来回；蛛卵顺序陷阱、蜘蛛移动加价不生效、巢穴在煤槽必输 |
| 剧本 · 封印之夜 | [systems/scenario-seals.md](systems/scenario-seals.md) | 可完整游玩；几乎不可能输，没有敌方压力；封印在煤槽时必输 |
| AI 行为 | [systems/ai-behaviour.md](systems/ai-behaviour.md) | 已覆盖全部阶段，合法且确定；单步贪心，无难度分级；罗网优先级把玩家带进蛛卵陷阱 |

## 跨系统待办（需要主理人 / 用户决定或转交程序）

| # | 事项 | 性质 | 涉及 |
|---|------|------|------|
| 1 | 目标房间选取排除煤槽 | **已修复**（S1-ENG-01） | `RoomRules.passThrough`、`Game.path`、`Game.summon`、`Rescue.setup`、`seals.js startHaunt` |
| 2 | 蜘蛛同房移动加价被覆盖 | **已修复**（S1-ENG-01） | `Game.cost` |
| 3 | 规则数字写死在界面文案里 | **已修复**（S1-ENG-01），剩余：罗网帮助页「随人数增加」、叛徒规则说明 | 见 S1-tuning-proposal §7 |
| 4 | 仪式 / 驱散 / 幽灵 / 封印参数配置化 | **已完成**（S1-ENG-01）；仪式按英雄数缩放的新键待实现 | 见 S1-tuning-proposal §7.1 |
| 5 | 叛徒选取规则、探索期长度、预兆是否有效果、角色是否有能力 | 设计方向，需用户拍板 | game-concept §7 |
| 6 | 三剧本数值调整 | 提案已出，待拍板 | `balance/S1-tuning-proposal.md` |

## 数据说明

文档里标注「探针数据」的数字来自文策渊用 Node 直接跑引擎的全 AI 对局（默认阵容、正常探索入口、每项 300–400 个种子），只用于确认规则事实和结构性问题；正式胜率与调参依据以 QA 报告为准。
