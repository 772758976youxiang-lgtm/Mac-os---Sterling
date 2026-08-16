# Agent Note: MCP 生图路由与内联结果

Status: implemented

[English](2026-08-16-mcp-image-generation-routing-and-inline-result.md) | 中文

## Problem

MCP 生图桥接把明确的 prompt 作为插件来源的 user-role 消息提交，而 OpenAI Image API 适配器只接受直接用户消息，以免注入的运行时上下文成为生图 prompt。因此适配器会在请求 provider 之前拒绝桥接。工具 schema 还只暴露 prompt，因此即使适配器会发送路由级默认值，调用方也无法为单次请求选择构图尺寸和质量。成功生成的附件旁还会显示一条多余工具行，生成媒体无法直接成为本次工具调用的对话结果。

## Decision

`GenerateOptions.purpose` 为一次性的辅助生图调用加入 `image-generation`。MCP 桥接设置该 purpose，并提交一条插件来源 prompt。Image API 适配器只在该 purpose 存在时接受插件来源 prompt；普通调用仍要求直接用户来源。`GenerateOptions.imageGeneration` 携带请求级 `size`、`quality` 和图片数量。MCP schema 要求调用方选择尺寸和质量，并可提供单独输出图片的数量；适配器把这些值合并到路由配置之上，同时保持响应编码由路由持有。

工具结果继续向模型返回文本，并把图片引用持久化到展示元数据中。Web 生图 renderer 会用始终可见的图片组取代成功工具行；执行中、失败和元数据异常的结果仍保留工具行，从而继续显示进度和诊断信息。`session.attachment` 会把持久 `tool/result` 元数据 `images` 数组中的完整图片引用视为已获会话授权，同时拒绝字段不完整的仿冒对象和无关元数据。生成字节不会进入文本模型的后续上下文，而用户可以直接在对话中看到媒体。

## Alternatives considered

**把桥接 prompt 标记为直接用户消息。** 这会产生错误的来源信息，并允许代码绕过适配器对用户提交内容与注入上下文的区分。

**让 Image API 适配器接受所有插件来源 prompt。** 运行时快照和指令注入也使用插件来源。没有明确辅助 purpose 就选择这些内容，会重新引入适配器正在防止的 prompt 混淆。

**把图片块返回给调用方文本模型。** `tool-result` 内容中的生成附件会进入后续模型请求，并在纯文本路由上失败。展示元数据能让 Web Client 读取持久引用，同时不改变模型历史。

**追加一条额外 assistant 消息。** assistant 消息必须携带模型来源，并占用 agent loop 的 step 顺序。工具无法在不虚报所有权或改变 loop 语义的情况下伪造该事件。

**只在 prompt 文本中编码尺寸和质量。** “8K”或“高质量”等词语只能描述图片内容，不能设置 Image API 的协议字段。类型化请求参数既能让未提供字段沿用 provider 默认值，也能让实际请求可供检查。

## Consequences

MCP 桥接可以抵达配置的 Image API，同时普通插件上下文仍不能成为生图 prompt。每次 MCP 生图都会显式选择布局和质量，文生图 JSON 与图生图 multipart 请求都会收到相同的覆盖参数。Web 用户会立即看到不带成功调用标签的生成图片，包括回放已有会话时；非 Web Client 仍能获得文本完成摘要和持久元数据。内联图片组只影响展示，不会增加文本模型上下文大小。
