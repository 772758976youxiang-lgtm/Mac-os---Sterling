# Agent Note: OpenAI 兼容图像生成路由

Status: implemented

[English](2026-08-14-openai-image-generations-protocol.md) | 中文

## 问题

可配置提供方界面此前只提供面向聊天的协议。服务 OpenAI 兼容 `POST /images/generations` 的路由，例如 `gpt-image-2` 网关，只能伪装成其他协议保存，随后在聊天端点失败。Harness 已有持久化图片附件和助手图片渲染，但适配器没有将图像生成响应转换为这些块的路径。

## 决策

`llm-pi-ai` 现与聊天协议一起提供 `openai-image-generations`。路由仍通过既有 profile catalog 解析模型，默认声明 `text` 与 `image` 输入能力，适配器会在 pi-ai 聊天流之前拦截该协议。它只选择 `source.kind === 'user'` 的最新提交消息，而不是按 role 选取运行时上下文，因此后续的上下文注入不会替换提示词或丢弃其参考图片。提交消息只有文本时，它向 `<baseURL>/images/generations` 发送 JSON，其中包含 `model`、`prompt`、`size`、`quality`、`n` 和 `response_format`。该消息包含持久化图片附件时，适配器会读取已验证的字节，以 multipart 的 `image[]` 字段发往 `<baseURL>/images/edits`，并携带相同控制项和凭据。

`imageGeneration` 配置控制 `size`、`quality`、`n` 和 `responseFormat`；默认值为 `1024x1024`、`high`、`1` 和 `b64_json`，与给出的调用一致。base64 响应按 PNG 解码；URL 响应会在附件服务的编码字节上限内下载，且必须有受支持的图片媒体类型。附件服务除原有格式外接收 AVIF 与 HEIC/HEIF 上传，并在进入 Image API 编辑请求前将这两种浏览器格式归一化为 JPEG。本地参考图读取完成后，适配器会在等待远端图片响应之前发出第一个图片块起始事件；客户端局部状态将其表示为 `image-pending`，渲染带动画的生成占位，并在成功时被持久化的 `image` 块替换。该临时状态既不是上下文消息，也不构成中断证据，因此请求失败不会在对话记录中留下空白图片卡。每项结果都会先经 `ctx.attachments` 校验并持久化，适配器随后按顺序发出助手 `image` 块和成功结束事件。

## 曾考虑的替代方案

**把协议伪装成聊天补全别名。**不采用，因为图片端点接收的是 `prompt`，不是消息历史或工具 schema，响应带的是图片数据而不是流式文本。

**只增加下拉选项。**不采用，因为未实现的协议会让用户保存一个每次请求都会失败的提供方。该选项由实际端点调用、结果解码、附件持久化和助手内容流完整支撑。

**在会话内容中直接使用提供方 URL。**不采用，因为预签名 URL 会过期，并绕过附件存储的解码、媒体类型、字节上限和持久引用保证。

## 后果

图像生成提供方可由既有 Models 设置流程声明，并像其他模型一样选择。附加图片不再让宿主替换为已配置的视觉回退模型；请求会停留在所选生图路由并执行 Image API 编辑。因为所支持的端点只接收单个 prompt，它会忽略会话历史、system 文本和工具；它要求非空用户文本与已挂载的持久附件服务。蒙版、提供方专用输出格式和 token 用量报告仍不属于本协议。
