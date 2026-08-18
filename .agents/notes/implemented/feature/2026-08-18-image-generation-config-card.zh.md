# Agent Note: 插件配置中的图像生成卡片

Status: implemented

[English](2026-08-18-image-generation-config-card.md) | 中文

## 问题

生图路由(`mcp__image__generate_image`)只能通过设置文件或 Models 页面配置,而它的兄弟功能视觉识别路由已在 设置 → 插件 → 插件配置 中拥有专属折叠卡片。GUI 上没有选择生图模型、固定 provider 路由或调整请求超时的界面。

## 决策

在 `ui-settings-plugins` 的 `settings.plugin.item` 中注册一张新的「图像生成 / Image generation」卡片(order 35,紧挨在视觉识别卡片上方)。它是视觉卡片在生图侧的对应物:完整的手填提供方表单(Provider ID、显示名称、接口地址、协议、模型 ID、经凭据存储写入的只写密钥),并带相同的暂存/保存/放弃流程。协议选择器与视觉卡片一致,提供四个协议 —— `openai-completions`、`openai-responses`、`anthropic-messages`、`openai-image-generations` —— 宿主分别为每个协议分发:Image API 路径(`/images/generations` 与 `/images/edits`、请求头、b64/URL 解析)**委托给 llm-pi-ai 的 `generateOpenAIImages`**,让线上协议始终由协议层持有、绝不在桥接层重复;其余三个调用各自的原生端点(`/chat/completions`、`/responses`、`/messages`),并容错地从 `data[]`、`choices[].message` 内容块、`output[]` 条目或顶层 `content` 列表读取图片(其余三个协议拒绝参考图编辑)。模型选择的控制参数(`size`、`quality`,以及有对应概念的 `n`)在**每个协议**上都以顶层字段转发,因此支持 chat 出图的网关能收到与 Image API 路径相同的参数。provider id 只是分发标签而非路由键,因此任何非空 id 都可接受。宿主 `mcp__image__generate_image` 工具每次调用都读取实时设置(`current()`):配置了接口地址时直接调用自定义提供方,否则回退到已配置的 llm 生图路由。此前工具被锁定在挂载时的配置,这正是默认 `gpt-image-2` 看起来被写死的原因;自定义分发最初漏掉了 `content-type` 头,导致网关返回 502。

## 曾考虑的替代方案

**扩展视觉卡片,同时编辑两个路由系列。** 不予采用:两条路由是各自独立的特性,字段与默认值不同;一张卡片会混淆图像生成与图像识别。

**只提供受限于已配置 llm 路由的模型选择器。** 不予采用:用户想要与视觉卡片相同的完整自定义提供方界面,因此图像卡片与之镜像,工具直接分发到自定义接口。

## 后果

用户现在可以完全在 GUI 中配置自定义生图提供方,就在视觉卡片旁边,并与其他插件卡片拥有相同的保存/放弃语义与凭据处理,MCP 工具会立即跟随配置变化、无需重启。路由路径仍作为回退,供继续通过 Models 页配置生图路由的部署使用。
