# @deepseek-ai/dsh-mcp-image-generation

English | [中文](README.zh.md)

Local MCP-shaped image generation for DSH. It registers `mcp__image__generate_image`, so the active text model can call the existing configured Image API route without receiving its credentials.

The bridge searches configured providers for `gpt-image-2` by default. Set `provider` to pin a route, or `model` when the deployment uses another image model id. The bridge marks its one-shot call with the `image-generation` purpose, so the Image API accepts its explicit plugin prompt without treating ordinary injected context as a user prompt. Each call supplies `size` and `quality`, plus an optional separate-image count; these request controls override the corresponding route defaults without changing its response encoding. Generated images remain durable attachments: the text model receives only a completion summary, while the Web conversation renders a successful gallery without a redundant tool row.

The same bridge registers `mcp__vision__analyze_image`. When the active model is text-only, it can call this tool to inspect the newest image in the user message. Configure the visual route directly in Plugins > Image understanding: the form accepts a custom Provider ID, display name, endpoint, API key, model ID, and one of `openai-completions`, `minimax-h3`, `openai-responses`, `anthropic-messages`, or `openai-image-generations`. MiniMax H3 uses its OpenAI-compatible Chat Completions dialect; Responses and Anthropic use their native message shapes. The image-generation protocol is listed for parity with model routes but cannot perform visual recognition. The key is kept in the credential store and image bytes are read from the durable attachment store only when the tool runs.

```yaml
- id: mcp-image-generation
  name: '@deepseek-ai/dsh-mcp-image-generation'
  config:
    visionProvider: vision-gateway
    visionDisplayName: Vision Gateway
    visionBaseURL: https://gateway.example/v1
    visionApi: openai-completions
    visionApiKeyEnv: VISION_GATEWAY_API_KEY
    visionModel: vision-model
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

`mcp__vision__analyze_image` receives a text prompt and automatically sends the latest user image to the configured custom provider. It returns the provider's textual description or extraction result; source image bytes and provider credentials stay outside the calling model's tool result.

## Known Limitations and Deferred Work

- Inline image presentation is available in the Web client. Other clients receive the textual completion summary and durable attachment metadata.
