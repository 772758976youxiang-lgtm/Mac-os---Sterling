# 配置模型

[English](providers.md) | 中文

本指南假定你已按照[根 README](../../../README.md#run)启动 Web UI。模型变更会在下一次请求时生效，不需要重启服务器。

## 配置 DeepSeek

打开**设置 → 模型**。DeepSeek 卡片提供一个 API 密钥字段；输入密钥并保存。

![模型页：DeepSeek 卡片，以及添加提供方与添加自定义提供方两个入口](providers-models-page.zh.png)

密钥是只写的。保存后，页面只会收到脱敏描述符，永远不会收到明文密钥。密钥存储在 `$DSH_HOME/.credentials.yaml` 中，settings 只保留它的凭据引用。

因此编辑提供方时，其 API 密钥字段会保持为空。占位提示表示已有凭据；输入新值只会替换当前提供方的凭据，留空则保留原凭据。

## 添加目录提供方

选择**添加提供方**，选取 Anthropic 或 OpenAI 等提供方，输入其 API 密钥并保存。已安装目录会提供端点、协议和模型列表。

使用原生认证的提供方需要各自的原生凭据。Bedrock、Vertex、Azure 和 Codex 分别使用 AWS 凭据与区域、ADC 项目、`api-version` 和 OAuth；只填写 API 密钥字段无法完成配置。

## 添加自定义提供方

对于公司网关、自建服务器或已安装目录中不存在的提供方，选择**添加自定义提供方**。提供小写 Provider ID、基础 URL、API 协议、凭据和至少一个模型。

![自定义提供方表单：Provider ID、显示名称、API 地址、API 协议、API 密钥](providers-custom-form.zh.png)

Provider ID 是永久的，因为请求、已保存会话、模型默认值和凭据引用都会使用它。如需重命名提供方，请添加新提供方并删除旧提供方。显示名称、基础 URL、协议、凭据和模型仍可编辑。

在**模型目录**中选择**获取可用模型**，可查询表单当前显示的基础 URL 和凭据。选择候选项只会更新草稿；保存前不会存储提供方。目录提供方使用已安装目录，不发起网络请求。

### 图片输入

当**获取可用模型**返回显式输入模态元数据时，Harness 会随所选模型一并采用。支持列表直接在 `input_modalities` 中披露，也支持 OpenRouter 等列表在 `architecture` 下披露。适配器还对已知的多模态 `qwen3.7-flash` id 有一个内置修正。

如果模型列表只报告 id，请展开模型的**高级**控件并选择**文本 + 图片**。保留**自动**时，会依次采用已安装 catalog、精确已知模型修正或提供方的保守回退值。若 catalog 或网关声明与实际使用的端点不符，可选择**仅文本**覆盖它。

同一设置也可在 `$DSH_HOME/settings.yaml` 中写成 `input`：

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: legacy-chat
        - id: vision-preview
          input: [text, image]
```

`input` 接受 `text` 和 `image`，且只作用于该模型，因此一条路由可以同时服务两类模型。省略它——或写成空列表，两者同义——就是表单的**自动**模式：保留已安装 catalog 为该模型记录的模态；catalog 未描述的模型则回退到该路由的 `defaultInput`。

如果你手动录入的模型全都接受图片，可以在路由上设置一次回退值，不必逐个模型写：

```yaml
llm-pi-ai:
  providers:
    vision-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://vision.example/v1
      defaultInput: [text, image]
      models:
        - id: first-model
        - id: second-model
```

`defaultInput` 是回退值而不是覆盖值，默认为 `[text]`：在目录提供方上，它只为目录未描述的模型作答，因此绝不会把目录中本就具备图片能力的模型的该能力去掉。要收窄这类模型，请用它自己的 `input`。目录提供方没有可供填写的 `models` 列表，因此写在 `modelOverrides` 下，以模型 id 为键：

```yaml
llm-pi-ai:
  providers:
    anthropic:
      modelOverrides:
        claude-sonnet-4-5:
          input: [text]
```

除模型自身的列表外，每个列表都至少要写一项模态；模型自身的空列表与省略它同义。未知模态在任何位置写入都会被拒绝。

这两个字段都是对你端点的断言，而不是对它的检查。声明了端点并不提供的图片能力的模型不会在这里被拦下，改由提供方拒绝该请求。

### 思考档位

当**获取可用模型**返回结构化推理元数据时，Harness 会采用该模型支持的档位，并将其加入该模型的思考档位选择器。支持 OpenRouter 风格的 `reasoning.supported_efforts`，也会读取推理是否强制开启；允许关闭推理的模型还会获得**关闭**档位。当列表没有这类元数据时，`qwen3.7-flash` 及其日期版本 id 会采用内置的**关闭** / **高**修正：在 Qwen 的 Chat Completions API 下，两项分别表示关闭或开启混合思考模式，不代表离散的 `reasoning_effort` 强度。

OpenAI 兼容协议没有统一的能力查询端点。若列表只报告 id，且内置修正和已安装 catalog 均无记录，Harness 会保留提供方默认行为，不会发送一次消耗额度的生成请求来探测。此类模型可在 `settings.yaml` 中声明 `reasoningEfforts`：每个键是选择器档位，每个值是发送给提供方的拼写。准确格式见 [pi-ai 适配器参考](../../../packages/llm/llm-pi-ai/README.md#per-model-reasoning-efforts)。

## 选择模型

已配置的提供方会出现在模型选择器中。选择模型也会将其设为新会话的默认值。已发送过请求的会话会保留自身日志中记录的模型。

如果已保存默认值指向已删除的提供方，输入框会显示**选择模型**，并在选择其他模型前阻止输入。

## 排错

- **`MISSING_CREDENTIAL`**：通过模型页存储提供方密钥，或提供被引用的环境变量。
- **`UNKNOWN_MODEL`**：选择已配置的模型，或向自定义提供方添加缺失的模型。
- **获取可用模型返回 401**：检查密钥。模型发现会调用 OpenAI 兼容的 `GET /models` 端点；对于不提供该端点的服务，请手动输入模型。
- **某个提供方的密钥出现在另一个编辑框中**：请更新到包含凭据字段隔离修复的版本后重新加载。Harness 不会把已存密钥明文返回给表单；浏览器或密码管理器的自动填充也应忽略这些字段。
- **图片在发送前被拒绝**：该模型未声明图片模态。请给自定义提供方的模型加上 `input: [text, image]`；`qwen3.7-flash` 会被自动识别，而 DeepSeek 自身的 chat-completions 路由是纯文本的，且无法通过配置改变。
- **提供方拒绝了带图片的请求**：该模型声明了其端点实际并不提供的图片能力。请从授予它图片能力的那个列表中移除 `image`——可能是模型的 `input`，也可能是路由的 `defaultInput`——然后开启新会话：附加的图片会留在会话日志里，因此在会话离开它之前，同一个请求会不断重复。

## 进阶配置

自动生成的[插件配置目录](../../config-catalog.md)列出所有受支持的字段与默认值。[`dsh-llm-pi-ai`](../../../packages/llm/llm-pi-ai/README.md) 和 [`dsh-llm-deepseek`](../../../packages/llm/llm-deepseek/README.md) 参考文档负责直接 `settings.yaml` 配置、目录解析、推理控制、凭据与适配器错误。
