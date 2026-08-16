# Agent Note: Web composer IME 组合输入所有权

Status: implemented

[English](2026-08-16-web-composer-ime-composition.md) | 中文

## Problem

Web composer 过去会把每个 IME 中间编辑同步写入 Session 输入状态机。这个全局受控值适用于普通输入，但原生组合输入期间若发生无关 React 刷新，它可能被回写到 textarea 并终止操作系统的标记文本会话。之后的拼音按键就会以拉丁字母原样进入草稿。既有组合防护能阻止选择候选字时按 Enter 触发发送，却无法保护组合缓冲区本身。

## Decision

组合输入活跃期间，composer 由组件本地持有一份 draft。textarea、可见装饰 backdrop 与隐藏尺寸 mirror 都渲染这个本地值；命令和引用装饰会暂停，因为它们的 offset 属于最后一次已提交的状态机 draft。普通 Session、投影、工具和菜单更新仍可重新渲染组件，但无法替换标记文本。

`compositionend` 发生时，composer 会把 textarea 最终值一次性提交到 Session 输入状态机，并在最终光标位置重新运行 trigger tracking。范围更宽的 Enter 防护会继续保留，以覆盖 Safari 延迟到达的结束 keydown。新一轮组合开始时会取消上一轮清理定时器，因此快速输入下一段文字不会错误继承「已结束组合」状态。

## Alternatives considered

**只保留 keydown 组合防护。** 这能阻止误发送，却无法阻止受控值写入终止标记文本，而后者正是草稿中留下拉丁拼音的原因。

**把 textarea 改为完全非受控。** 这会隔离原生组合输入，但会破坏 Session draft 切换、状态机所有的撤销、chip 事务、装饰 offset 和确定性的发送后清空。

**对所有 draft 更新做 debounce。** 普通输入、命令检测、持久化和发送就绪状态都会产生延迟，而真正需要隔离的只有原生组合输入。

## Consequences

拼音及其他 IME 可以跨越无关的 composer 重渲染，同时不改变 textarea DOM 或既有快捷键行为。可见 backdrop 会继续展示实时标记文本。尚未完成的组合片段在操作系统提交前只存在于浏览器本地，因此在这个短暂区间内不会持久化，也不会参与命令检测。
