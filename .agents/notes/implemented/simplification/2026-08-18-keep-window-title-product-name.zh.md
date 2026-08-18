# Agent Note: 窗口标题保持产品名

Status: implemented

[English](2026-08-18-keep-window-title-product-name.md) | 中文

## 问题

外壳会把当前会话的持久标题投影进浏览器标题(`<会话标题> — Sterling Harness`)。原生窗口外壳已经自己前缀产品名,于是操作系统窗口标题变成了 `Sterling Harness - <会话标题> — Sterling Harness` —— 产品名重复出现,中间还夹着一长串会话标题。

## 决策

投影已移除。`buildRenderApp` 不再挂载任何 document.title 副作用;操作系统窗口标题保持文档头部里的产品名(`Sterling Harness`)。`DocumentTitle` 及其测试已删除,app-shell 测试现在固定断言:选择会话不会触碰窗口标题。会话标题仍是会话记录与侧边栏内容,只是不再是窗口外壳的一部分。

## 曾考虑的替代方案

**把投影格式化为 `<会话标题> — Sterling Harness`(去掉外壳前缀)。** 不予采用:原生外壳的前缀不受 Web 应用控制,双产品名的组合无法从这里修复;唯一稳健的结果就是完全不投影。

**只在窗口失焦时投影标题。** 不予采用:操作系统标题是窗口属性,不是交互提示;按聚焦/失焦拆分只是增加行为,并不能解决冗余。

## 后果

窗口标题始终是 `Sterling Harness`,与侧边栏 wordmark 一致,会话标题不再在系统外壳中重复。被删除的投影少了一次 document.title 写入及其清理副作用。
