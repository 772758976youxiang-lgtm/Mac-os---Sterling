# Agent Note: 隐藏思考后工具行上方残留幽灵空隙

Status: implemented

[English](2026-08-19-show-thinking-streaming-spacing.md) | 中文

## 问题

关闭「显示思考过程」后，会话记录偶尔出现间距不均：工具调用行上方出现约两倍的空隙，而其下方（通常是上下文注入行）保持正常的 16px 节奏。症状是间歇性的——在智能体运行 turn 期间出现。开关本身见[「显示思考过程」开关 feature note](../feature/2026-08-19-show-thinking-toggle.md)。

## 根因

两个独立缺陷让被过滤掉的 assistant step 继续占据 flow 列 16px 的 gap：

1. `AssistantMarkdown` 的 `hasVisible` 把 `streaming` 无条件视为「需要渲染外壳」的理由，于是块已被过滤的流式纯思考 step 仍渲染零高度的 `.root > .body` 外壳。
2. 即使外壳被丢弃，keyed slot 出口（`SlotOutlet`）总是用 `display: contents` 锚包装渲染器，被拒绝的行永远不会是空的 flex 项，`ChatNodeSeat` 的 `.flowItem:empty { display: none }` 永不触发。每个块只有思考（和工具头）的已结算 step 因此继续保留它的 flow 行与 gap。

隐藏 step 下方的工具行于是在正常间距之上又多出 16px，视觉上约为 32px；spec 里的 `renderSlot` 桩直接返回渲染器，`.flowItem:empty` 折叠在测试中生效，第二个缺陷因此未被发现。

## 决策

`AssistantMarkdown` 现在只在过滤后仍有可见块时才渲染外壳（streaming 本身不再作为渲染理由）；`ChatNodeSeat` 在同一可见性判断失败时彻底不渲染 assistant-step 行，被过滤的 step 完全不占 flow 行。共享的 `assistantBlocksVisible` 辅助函数让两处判断只有一个事实来源；图片生成占位（仅流式）与中断标记保留原有行为。同一改动顺带修正了 image 分组循环中潜伏的索引错位——该循环遍历过滤后的 `visibleBlocks`，却在原始 `blocks` 数组上推进，当思考块位于连续图片之前且思考被隐藏时可能重复渲染同一张图片。spec 现在复现真实的出口锚包装，空行处理得到真实检验；回归测试断言被折叠的 step 不占任何 flow 行。

## 曾考虑的替代方案

**保留 streaming 无条件渲染，改用 CSS 折叠空外壳。** 不予采用：空外壳是真实的 flex 项，依赖兄弟元素的选择器无法得知 slot 出口内容是否渲染了任何东西。

## 后果

块被全部过滤（隐藏思考、工具头）的 step，无论已结算还是流式中，都不再在后续工具行上方留下幽灵空隙，无论思考显示与否 flow 都保持统一的 16px 节奏。流式文本回复仍渲染外壳与脉冲；图片生成占位与中断标记不受影响。回归覆盖在 `coverage-tails.client.spec.tsx`（流式折叠）与 `chat-view.client.spec.tsx`（flow 行缺失）中断言。
