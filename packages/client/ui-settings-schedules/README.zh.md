# @deepseek-ai/dsh-client-ui-settings-schedules

[English](README.md) | 中文

定时任务设置插件。它以顺序 12 注册 `schedules` 分区，位于「模型」和「插件」之间，并通过类型化的 Host Schedule API 管理活动提醒。

## 行为

页面列出当前拥有 Schedule 运行时的 live 根会话中的提醒。每行显示归属会话、一次性或固定速率周期、下次目标时间，以及 `scheduled` 或 `overdue` 状态。用户可以按浏览器本地日期和时间创建一次性任务、创建最短间隔为 5 分钟的固定速率任务、编辑两种任务、确认后删除任务，或刷新目录。

创建和删除保留 Schedule 包的持久化 barrier（屏障）。编辑是同一会话中的事务性替换：旧记录收到 delete 事件，新记录以永不复用的 id 收到 create 事件，组合追加到达持久化 barrier 后操作才会确认。编辑时表单固定归属会话，并把绝对目标作为 UTC RFC 3339 时点发送。

页面存储会在每次已接受的变更后以及连接重置后刷新。fixture（测试前置数据）模式包含两条内存提醒，并实现相同的 CRUD 约定，供独立浏览器验证。

## 模型体验

### 定时任务设置界面

#### 模型看到的内容

此客户端包不增加模型工具或提示词内容。当受管理的提醒到期时，`@deepseek-ai/dsh-schedule` 仍通过普通会话 follow-up 行为交付提醒。

#### Token 影响

此包没有影响。到期提醒保留 Schedule 包记录的 token 行为。

#### KV Cache 影响

此包没有影响。

## 已知限制与暂缓事项

- 目录只包含已挂接 Schedule 运行时的 live 根会话。读取设置不会恢复 cold 会话，也不会激活其中 overdue 的提醒。
- 跨标签页变更没有 Schedule 事件帧；页面会在手动刷新、连接重置或自身变更后收敛。
- 周期规则是至少 5 分钟的固定间隔。日历规则与 Cron 规则不在 Schedule 协议范围内。
