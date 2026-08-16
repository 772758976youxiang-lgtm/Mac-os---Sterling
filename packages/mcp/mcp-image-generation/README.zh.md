# @deepseek-ai/dsh-mcp-image-generation

[English](README.md) | 中文

DSH 的本地 MCP 形态生图能力。它注册 `mcp__image__generate_image`，让当前文本模型调用已配置的 Image API 路由，而无需接触图像服务的密钥。

默认会在已配置的 provider 中寻找 `gpt-image-2`。可设置 `provider` 固定路由，或通过 `model` 选择部署中的其他生图模型。桥接层用 `image-generation` purpose 标记这次一次性调用，因此 Image API 可以接受明确的插件 prompt，同时不会把普通注入上下文当成用户 prompt。每次调用都会提供 `size` 和 `quality`，并可提供单独输出图片的数量；这些请求参数会覆盖对应的路由默认值，但不改变响应编码。生成的图片作为持久附件保存：文本模型只收到完成摘要，Web 对话会直接显示成功图片组，不再保留多余的工具行。

同一个桥接还注册 `mcp__vision__analyze_image`。当前模型不具备多模态能力时，可以调用这个工具识别用户消息中的最新图片；桥接在 Host 内读取持久附件，再发送到配置的 OpenAI 兼容 Qwen 接口。默认模型为 `qwen3.7-flash`，默认地址为 DashScope 兼容接口。Web 的 MCP 管理页通过凭据服务保存 API Key，因此密钥不会返回浏览器，也不会写进设置文档。

```yaml
- id: mcp-image-generation
  name: '@deepseek-ai/dsh-mcp-image-generation'
  config:
    visionApiKeyEnv: DASHSCOPE_API_KEY
    visionModel: qwen3.7-flash
    visionBaseURL: https://dashscope.aliyuncs.com/compatible-mode/v1
```

```yaml
- id: mcp-image-generation
  name: '@deepseek-ai/dsh-mcp-image-generation'
  config:
    provider: rayplus-images # optional
    model: gpt-image-2
```

## 模型体验

### 工具 schema 与结果

#### 模型看到的内容

当前文本模型会收到生成的 [`mcp__image__generate_image` 工具 schema](../../../docs/tool-catalog.md#deepseek-aidsh-mcp-image-generation)，并自行决定何时调用。它必须选择 `size`（`1024x1024`、横向 `1536x1024`、纵向 `1024x1536` 或 `auto`）和 `quality`（`low`、`medium`、`high` 或 `auto`）；可选的 `count` 用于请求多张单独图片。成功结果只返回简短的文本完成摘要；图片字节和附件引用不会进入调用方模型的上下文。

#### Token 影响

工具 schema 与文本结果消耗普通 prompt token。生成图片的字节不消耗模型上下文 token。

#### KV Cache 影响

稳定的工具 schema 可以与其余系统提示词一同缓存。每次工具调用及其文本结果会正常扩展对话前缀。

### 识图能力

`mcp__vision__analyze_image` 接收识别要求，并自动选择最新用户消息中的图片。它返回 Qwen 的文字描述或提取结果；原图字节和 API Key 都不会进入模型可见的工具结果。

## 已知限制与后续工作

- Web Client 支持内联图片展示。其他 Client 会收到文本完成摘要和持久附件元数据。
