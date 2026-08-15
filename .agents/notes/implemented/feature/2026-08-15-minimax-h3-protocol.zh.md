# Agent Note: MiniMax H3 协议标识

Status: implemented

[English](2026-08-15-minimax-h3-protocol.md) | 中文

## 问题

Models 设置页提供通用 OpenAI 兼容协议，但没有 MiniMax H3 部署的明确选项。选择 `openai-completions` 虽然可以调用，却会丢失部署标识；而增加未实现的标识会让用户保存一个无法发起请求的路由。

## 决策

`llm-pi-ai` 将 `minimax-h3` 提供为手工声明的聊天协议。它使用 pi-ai 的 OpenAI Chat Completions 流实现构建 provider，因此每个请求都携带配置的 Bearer API key，并发送至 `<baseURL>/chat/completions`。`Config` schema 仍是 Models 设置协议选择器的唯一来源，因此新选项同时出现在创建和编辑路径，无需另行维护 UI 列表。

## 曾考虑的替代方案

**只使用 `openai-completions`。** 不采用，因为保存后的 profile 和设置选择器无法将 MiniMax H3 部署与普通网关区分开。

**使用 MiniMax 的 Anthropic 兼容 API。** 不采用，因为此协议针对 OpenAI 兼容端点及其 Bearer 鉴权请求格式。对于使用 MiniMax Anthropic 兼容端点的部署，既有的 `anthropic-messages` 选项仍可使用。

## 后果

用户可以选择 `minimax-h3`，获取部署的 OpenAI 兼容 `GET /models` 目录，并通过其 Chat Completions 端点发起流式聊天和工具请求。该协议不会杜撰模型标识、端点或推理格式：每个部署都提供准确的模型 ID 和 API 前缀，超出 OpenAI Chat Completions 的 provider 专有字段仍不受支持，直到已知 H3 需求需要它们。适配器测试验证端点、模型目录、响应流和 Bearer 鉴权；UI schema 测试验证该选项在设置中可见。
