# @deepseek-ai/dsh-mcp-image-generation

English | [中文](README.zh.md)

Local MCP-shaped image generation for DSH. It registers `mcp__image__generate_image`, so the active text model can call the existing configured Image API route without receiving its credentials.

The bridge searches configured providers for `gpt-image-2` by default. Set `provider` to pin a route, or `model` when the deployment uses another image model id. The bridge marks its one-shot call with the `image-generation` purpose, so the Image API accepts its explicit plugin prompt without treating ordinary injected context as a user prompt. Each call supplies `size` and `quality`, plus an optional separate-image count; these request controls override the corresponding route defaults without changing its response encoding. Generated images remain durable attachments: the text model receives only a completion summary, while the Web conversation renders a successful gallery without a redundant tool row.

The same bridge registers `mcp__vision__analyze_image`. When the active model is text-only, it can call this tool to inspect the newest image in the user message; the bridge reads the durable attachment in the Host and sends it to the configured OpenAI-compatible Qwen endpoint. The default model is `qwen3.7-flash` at DashScope's compatible endpoint. The Web MCP management tab stores the API key through the credential service, so the key is never returned to the browser or written into the settings document.

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

## Model Experience

### Tool schema and result

#### What the model sees

The active text model receives the generated [`mcp__image__generate_image` tool schema](../../../docs/tool-catalog.md#deepseek-aidsh-mcp-image-generation) and chooses when to call it. It must choose `size` (`1024x1024`, landscape `1536x1024`, portrait `1024x1536`, or `auto`) and `quality` (`low`, `medium`, `high`, or `auto`); `count` optionally requests multiple separate images. A successful result returns a short textual completion summary; image bytes and attachment references do not enter the caller's model context.

#### Token effect

The tool schema and textual result consume ordinary prompt tokens. Generated image bytes consume no model-context tokens.

#### KV Cache effect

The stable tool schema is cacheable with the rest of the system prompt. Each tool call and textual result extends the conversation prefix normally.

### Image understanding

`mcp__vision__analyze_image` receives a text prompt and automatically selects the latest user image. It returns Qwen's textual description or extraction result; source image bytes and the API key stay outside the model-visible tool result.

## Known Limitations and Deferred Work

- Inline image presentation is available in the Web client. Other clients receive the textual completion summary and durable attachment metadata.
