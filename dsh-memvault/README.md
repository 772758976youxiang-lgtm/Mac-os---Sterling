# dsh-memvault — 记忆系统 Host 半体

记忆系统（memvault）的 Host 半体插件，与 `@deepseek-ai/dsh-client-ui-memory`（设置 UI）配套。

## 功能

- 注册 4 个模型工具：
  - `memory_list` — 列出记忆库索引（name + description）
  - `memory_view` — 按 key 加载单条记忆正文
  - `memory_save` — 创建 / 更新记忆
  - `session_search` — 跨会话检索（模拟 FTS5，支持 unicode61 / trigram / bigram 分词策略）
- 暴露 `/api/memvault/*` HTTP JSON API（Client 设置 UI 的取数通道，无需改 apiproxy / typert）：
  - `mem.list` / `mem.view` / `mem.save` / `mem.delete`
  - `skill.list` / `skill.view`
  - `search.run`
  - `loop.events`
  - `providers.list`
- 数据持久化到 `<workspaceRoot>/.dsh-memory/`：
  - `memory.json`（索引）+ `mem-<key>.md`（纯 Markdown 正文，按 `##` 分区，无 frontmatter）
  - `skills.json` + `skill-<key>.md`（SKILL.md，YAML frontmatter）
  - `sessions.json`（会话，供 FTS5 检索）
  - `events.json`（学习循环事件）

## 安装

作为 bundle 插件安装到任意 profile：

```sh
dsh plugin --profile web add .
```

（在插件 checkout 目录执行；相对路径锚定到调用目录。）

或手动在 profile 的 `cordis.patch.yml` 中插入插件行：

```yaml
- insert:
    - id: dsh-memvault
      name: 'dsh-memvault'
```

## 配套

- Client 设置 UI：`packages/client/ui-memory/`（注册 `settings.section`「记忆系统」页，含记忆库 / 技能库 / 会话检索 / 学习循环 / 记忆提供者 5 个标签页）
- 部署时确保 `@deepseek-ai/dsh-client-ui-memory` 已随 `dsh-web-app` bundle 安装（其依赖已加入 `packages/bundle/web-app/package.json`）。

## 数据格式

记忆为纯 Markdown，按语义化 `##` 分区（背景 / 事实 / 工作流 / 偏好 / 约定 等），元数据（type/category/importance/tags/updated/expires）由 `memory.json` 单独维护，不写入正文。
