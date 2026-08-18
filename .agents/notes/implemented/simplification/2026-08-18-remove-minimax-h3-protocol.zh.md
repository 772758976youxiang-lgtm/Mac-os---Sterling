# Agent Note: 移除 MiniMax H3 协议标识

Status: implemented

[English](2026-08-18-remove-minimax-h3-protocol.md) | 中文

## 问题

MiniMax H3 协议标识当初加入 `llm-pi-ai`，是为了让 MiniMax H3 部署在已保存的 profile 和 Models 设置选择器中与通用网关区分开，而不必复用裸的 `openai-completions` 名称。它只是一个配置层的方言标识：命名 `minimax-h3` 的 profile 与 `openai-completions` 由同一个 pi-ai OpenAI Chat Completions 实现提供服务，Bearer 鉴权、`<baseURL>/chat/completions` 请求、模型列表与流式响应完全相同。没有任何部署采用该标识，且两者在线路上毫无区别，因此这个名称只是加宽了配置面、发现列表与文档，而没有增加任何能力。

## 决策

`minimax-h3` 已从对外提供的协议面中移除。`llm-pi-ai` 提供方构造中的 `MINIMAX_H3_API` 常量及其 `PROTOCOLS` 条目已删除，因此 `supportedProtocols()` 不再提供该标识，`Config` 模式的 `api` 联合——即 Models 设置协议选择器的来源——不再渲染它，包根也不再导出该常量。`discovery.ts` 的可列表协议集合删除了该标识，README 的 MiniMax H3 小节与示例 profile 已删除，固定该标识的适配器、发现与 UI 模式测试已移除；`declared-edit` 快照不再列出该选项。自定义视觉提供方与模型协议集合保持一致，因此 `mcp-image-generation` 与插件设置卡片中的 `VISION_API_PROTOCOLS` 列表同样删除了该标识——连同视觉 README 的协议枚举以及端点与选项列表测试——保存的 `visionApi` 若为 `minimax-h3`，会像任何未知协议一样被视觉 `Config` 联合拒绝。存储的 profile 若命名 `minimax-h3`，会被 `api` 模式以不受支持的协议响亮拒绝——与任何未知协议得到的拒绝相同——因此无需兼容别名、迁移或存量文档处理。

## 曾考虑的替代方案

**保留该标识，作为 `openai-completions` 的文档化别名。** 不予采用：两者在线路上毫无区别，多余的名称只会加宽面；原始动机——已保存 profile 中可见的部署身份——已由每个 profile 都携带的 `displayName` 字段承担。

**保留该标识，但从新建路由入口隐藏。** 不予采用：一个模式仍接受的纯配置标识，会继续存在于模式、发现列表与文档中，却无法从 UI 触达——两头都不讨好。

## 后果

MiniMax H3 部署现在直接声明 `openai-completions`，以更少的名称获得完全相同的请求、模型列表、流式响应与 Bearer 鉴权；协议表、发现列表、选择器与文档各少一个名称。放弃的能力只有配置层标识本身，不涉及任何线上行为。一旦出现确实需要独立名称的 MiniMax 方言，重新引入只需在 `PROTOCOLS` 加一行、在发现列表加一项并在 README 补一节；在此之前，原始理由仍由 `displayName` 覆盖。缺席已得到验证：任何源码、测试、文档或快照都不再引用 `minimax-h3` 或 `MINIMAX_H3`；`llm-pi-ai`、`mcp-image-generation`、`ui-settings-plugins` 与客户端套件通过（既有的 `convert.spec` 与 `apiproxy` 失败保持不变），无密钥的 web 快照回放渲染出的模型与视觉协议选择器都不再包含该选项。
