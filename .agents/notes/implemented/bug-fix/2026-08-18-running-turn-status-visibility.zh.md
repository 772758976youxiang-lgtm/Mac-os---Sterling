# Agent Note: 运行中 turn 状态可见性与省略号文案

Status: implemented

[English](2026-08-18-running-turn-status-visibility.md) | 中文

## 问题

turn 级等待提示——「埋头苦干中 / 脑袋冒烟中 / 小宇宙爆发 / 挖呀挖呀挖」的轮播短语与运行时长时钟——只在会话 `running` 位为 true 时渲染。该位由宿主下发的实时 `host/session-status` 帧承载,而宿主只在 agent 状态发生**切换**时发帧;一旦帧在任务进行中被错过或乱序(中途刷新、丢帧或重排),该位在整个任务期间保持 false,等待内容就悄悄完全不出现。四个短语也没有省略号。

## 决策

现在只要会话窗口里存在一个未结束的 turn,或 `running` 位为 true,状态就会渲染:`running || <事件日志时间线中存在 open turn>`。open turn 边界(`turn/start` 已到而 `turn/end` 未到)由 `ConversationLocationIndex` 从持久会话日志推导,不像实时状态帧那样会丢失,同时兼任运行时长时钟的锚点。四个轮播短语统一补上了省略号(`…`)。测试 fixture 中那些终态场景(turn 错误、max-tokens 截断提示)原先让 turn 在测试时间线里保持 open,现在补上 `turnEnds` 条目将其关闭,与真实场景中结束这些 turn 的 `turn/end` 一致,因此错误与截断提示仍然正常渲染,不再带出等待状态。

## 曾考虑的替代方案

**由宿主在每个 `turn/start` 时补发一条 `host/session-status running:true`。** 不予采用:agent 状态中继本来就是权威的 running 信号,再增加一个发射源会形成两个可能不一致的事实来源;把 UI 条件改为从日志推导,客户端只保留一个权威信号。

**继续只以 running 位为唯一条件,依赖会话列表基线覆盖中途刷新。** 不予采用:基线只覆盖刷新场景,覆盖不了任务进行中丢帧或乱序的情况,而后者正是被报告的故障。

## 后果

只要 turn 确实处于未结束状态,等待状态就会保持可见,解决了「任务中偶尔不出现」的问题;代价是若某个 turn 的 `turn/end` 从未写入日志(例如进程被杀),状态会一直显示到下一个边界到来——这比隐藏它更诚实。正常结束时,状态仍在 `turn/end` 处消失。省略号让文案读起来是进行中的动作,而不是已完成的陈述。
