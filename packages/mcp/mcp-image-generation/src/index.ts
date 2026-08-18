/** Local image-generation capability exposed in the MCP tool namespace. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'

/** Default configured model id for the existing image route. */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
/** Public MCP-style tool name available to text models. */
export const GENERATE_IMAGE_TOOL = 'mcp__image__generate_image'
/** Public MCP-style tool name available to text models. */
export const ANALYZE_IMAGE_TOOL = 'mcp__vision__analyze_image'
/** Settings namespace shown by the MCP management page. */
export const IMAGE_GENERATION_SETTINGS_NAMESPACE = settingsNamespace('mcp-image-generation')
/** API protocols accepted by the visual-recognition provider form. */
export const VISION_API_PROTOCOLS = [
  'openai-completions',
  'minimax-h3',
  'openai-responses',
  'anthropic-messages',
  'openai-image-generations',
] as const
type VisionApi = typeof VISION_API_PROTOCOLS[number]

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'mcp-image-generation'
/** The tool uses the existing image router, attachment store, and settings. */
export const inject = ['tools', 'llm', 'attachments', 'settings']

/** Configuration for the local image MCP bridge. */
export interface Config {
  /** Optional provider route; when omitted the first route owning `model` is used. */
  provider?: string
  /** Configured OpenAI Image API model id. Defaults to `gpt-image-2`. */
  model?: string
  /** Cooperative upper bound for one image-generation request. */
  timeoutMs?: number
  /** Custom provider id used for visual understanding. */
  visionProvider?: string
  /** Custom provider display name. */
  visionDisplayName?: string
  /** OpenAI-compatible endpoint used for visual understanding. */
  visionBaseURL?: string
  /** Wire protocol used by the custom provider. */
  visionApi?: VisionApi
  /** Credential reference resolved for each vision request. */
  visionApiKeyEnv?: string
  /** Write-only API key slot for schema and settings redaction. */
  visionApiKey?: string
  /** Custom visual model id. */
  visionModel?: string
  /** Maximum output tokens requested from the visual model. */
  visionMaxTokens?: number
  /** Cooperative upper bound for one vision request. */
  visionTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  provider: z.string().default(''),
  model: z.string().default(DEFAULT_IMAGE_MODEL),
  timeoutMs: z.number().default(120_000),
  visionProvider: z.string().default(''),
  visionDisplayName: z.string().default(''),
  visionBaseURL: z.string().default(''),
  visionApi: z.union([...VISION_API_PROTOCOLS]).default('openai-completions'),
  visionApiKeyEnv: z.string().role('credential-ref').default('STERLING_VISION_API_KEY'),
  visionApiKey: z.string().role('secret'),
  visionModel: z.string().default(''),
  visionMaxTokens: z.number().step(1).min(1).default(2_048),
  visionTimeoutMs: z.number().step(1).min(1).default(120_000),
})

/** Flat settings projection consumed by the MCP management form. */
export interface VisionSettings {
  visionProvider: string
  visionDisplayName: string
  visionBaseURL: string
  visionApi: string
  visionApiKeyEnv: string
  visionModel: string
  visionMaxTokens: number
  visionTimeoutMs: number
}

interface ImageValue {
  attachmentId: string
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

interface GenerationValue {
  provider: string
  model: string
  images: ImageValue[]
}

interface VisionValue {
  model: string
  images: number
  text: string
}

function imageValue(ref: ImageAttachmentRef): ImageValue {
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...ref.name === undefined ? {} : { name: ref.name },
  }
}

/** Resolve the configured image model without duplicating provider keys or endpoints. */
async function resolveImageRoute(ctx: Context, config: Required<Config>): Promise<{ provider: string; model: string }> {
  const providers = config.provider === ''
    ? ctx.llm.listProviders().map(provider => provider.id)
    : [config.provider]
  for (const provider of providers) {
    const models = await ctx.llm.listModels(provider)
    if (models.some(model => model.id === config.model)) return { provider, model: config.model }
  }
  const route = config.provider === '' ? `for model "${config.model}"` : `at provider "${config.provider}"`
  throw new Error(`image generation is unavailable: no configured image route was found ${route}`)
}

/** Model-facing completion stays textual so a text-only caller never has to consume its generated image. */
function generationText(value: GenerationValue): string {
  return `Generated ${String(value.images.length)} image${value.images.length === 1 ? '' : 's'} with ${value.model} on ${value.provider}. The image is already attached to this result and displayed in the conversation; do not search for, copy, or analyze it unless the user explicitly asks.`
}

/** Find images on the newest human message, skipping user-role runtime context. */
type ImageMessageAgent = {
  session: {
    deriveMessages: () => readonly {
      role: string
      source: { kind: string }
      content: readonly unknown[]
    }[]
  }
}

function latestHumanImages(agent: ImageMessageAgent | undefined): ImageAttachmentRef[] {
  if (agent === undefined) return []
  for (const message of [...agent.session.deriveMessages()].reverse()) {
    if (message.role !== 'user' || message.source.kind !== 'user') continue
    return message.content
      .filter((block): block is { type: 'image'; attachment: ImageAttachmentRef } => (
        typeof block === 'object' && block !== null
        && (block as { type?: unknown }).type === 'image'
        && 'attachment' in block
      ))
      .map(block => block.attachment)
  }
  return []
}

/** Resolve the custom provider form before dispatching any image bytes. */
function resolveVisionRoute(config: Required<Config>): { provider: string; model: string; baseURL: string; api: string } {
  if (config.visionProvider === '' || config.visionBaseURL === '' || config.visionModel === '') {
    throw new Error('image understanding is unavailable: complete the custom provider in 插件 > 视觉识别')
  }
  if (!VISION_API_PROTOCOLS.includes(config.visionApi as VisionApi)) {
    throw new Error(`image understanding does not support the "${config.visionApi}" protocol`)
  }
  return {
    provider: config.visionProvider,
    model: config.visionModel,
    baseURL: config.visionBaseURL,
    api: config.visionApi,
  }
}

/** Resolve a custom provider key at request time so rotation applies without restart. */
async function resolveVisionApiKey(ctx: Context, config: Required<Config>): Promise<string | undefined> {
  const ref = credentialRef(config.visionApiKeyEnv)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(ref))?.value
  const ambient = launchEnvironmentOf(ctx).get(ref)
  return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
}

function visionEndpoint(baseURL: string, api: VisionApi): string {
  const path = api === 'openai-responses' ? '/responses'
    : api === 'anthropic-messages' ? '/messages'
      : '/chat/completions'
  return `${baseURL.replace(/\/+$/, '')}${path}`
}

function visionDataUrl(data: Uint8Array, mediaType: ImageMediaType): string {
  return `data:${mediaType};base64,${Buffer.from(data).toString('base64')}`
}

/** Run one visual prompt through the selected custom provider protocol. */
async function analyzeWithProvider(input: {
  baseURL: string
  api: VisionApi
  model: string
  prompt: string
  apiKey?: string
  images: readonly { data: Uint8Array; mediaType: ImageMediaType }[]
  maxTokens: number
  signal: AbortSignal
}): Promise<string> {
  if (input.api === 'openai-image-generations') {
    throw new Error('openai-image-generations is an image-generation protocol and cannot perform visual recognition')
  }
  const imageData = input.images.map(image => ({
    data: visionDataUrl(image.data, image.mediaType),
    mediaType: image.mediaType,
  }))
  const requestBody = input.api === 'openai-responses'
    ? {
      model: input.model,
      max_output_tokens: input.maxTokens,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: input.prompt },
          ...imageData.map(image => ({ type: 'input_image', image_url: image.data })),
        ],
      }],
    }
    : input.api === 'anthropic-messages'
      ? {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            ...input.images.map(image => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: Buffer.from(image.data).toString('base64'),
              },
            })),
          ],
        }],
      }
      : {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            ...imageData.map(image => ({ type: 'image_url', image_url: { url: image.data } })),
          ],
        }],
      }
  const response = await fetch(visionEndpoint(input.baseURL, input.api), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(input.api === 'anthropic-messages'
        ? input.apiKey === undefined ? {} : { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' }
        : input.apiKey === undefined ? {} : { authorization: `Bearer ${input.apiKey}` }),
    },
    body: JSON.stringify(requestBody),
    signal: input.signal,
  })
  const body = await response.json().catch(() => undefined) as {
    choices?: { message?: { content?: unknown } }[]
    output_text?: unknown
    output?: { content?: unknown }[]
    content?: unknown
    error?: { message?: unknown }
  } | undefined
  if (!response.ok) {
    const detail = typeof body?.error?.message === 'string' ? `: ${body.error.message}` : ''
    throw new Error(`custom vision request failed (${response.status})${detail}`)
  }
  const textFromContent = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .filter((part): part is { text: string } => typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string')
      .map(part => part.text)
      .join('')
  }
  const text = input.api === 'openai-responses'
    ? typeof body?.output_text === 'string'
      ? body.output_text
      : body?.output?.map(item => textFromContent(item.content)).join('') ?? ''
    : input.api === 'anthropic-messages'
      ? textFromContent(body?.content)
      : textFromContent(body?.choices?.[0]?.message?.content)
  const answer = text.trim()
  if (answer === '') throw new Error(`image understanding model "${input.model}" returned no text`)
  return answer
}

/** Register the local MCP-shaped `generate_image` tool. */
export function apply(ctx: Context, config: Config): void {
  // MCP runs alongside agent-scoped tool registries; settings are owned by
  // the application root so the Web Settings API can describe this namespace.
  const settings = ctx.root.get('settings') ?? ctx.get('settings')
  let current: () => Config = () => config
  if (settings !== undefined) {
    const settingsScope = settings.register(IMAGE_GENERATION_SETTINGS_NAMESPACE, Config, { base: config })
    current = () => settingsScope.get()
    settingsScope.watch(() => { current = () => settingsScope.get() })
  }
  const resolved = config as Required<Config>
  if (resolved.model.trim() === '') throw new Error('mcp-image-generation: model must not be empty')
  if (!Number.isFinite(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
    throw new Error('mcp-image-generation: timeoutMs must be a positive finite number')
  }
  ctx.tools.register(defineTool({
    name: GENERATE_IMAGE_TOOL,
    description: 'Create a new image or directly edit/transform images attached to the latest human message. For every image-generation request, call this tool directly: attached source images are forwarded unchanged to the image model, so do not call vision first, inspect attachment ids, or search files. Choose size and quality explicitly for the requested composition: use landscape for multi-view sheets or wide scenes, portrait for tall single-subject layouts, and square otherwise. For edits, describe the requested transformation and what must stay unchanged instead of guessing or restating visual details.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'For a new image, describe the desired result. For an edit, describe the change and the source details that must remain unchanged.' },
      size: {
        type: 'string', required: true,
        enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
        description: 'Output dimensions: 1024x1024 is square (1:1), 1536x1024 is landscape (3:2) for multi-view or wide layouts, 1024x1536 is portrait (2:3), and auto lets the provider choose.',
      },
      quality: {
        type: 'string', required: true,
        enum: ['low', 'medium', 'high', 'auto'],
        description: 'Image quality tier. Use high unless the user prioritizes speed or lower cost.',
      },
      count: {
        type: 'integer',
        description: "Number of separate output images, not the number of views within one image. Usually omit this to use the route's configured count (one by default).",
      },
    },
    timeoutMs: resolved.timeoutMs,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          provider: { type: 'string', required: true },
          model: { type: 'string', required: true },
          images: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heif'], required: true },
                bytes: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
                name: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: generationText(value) }],
      presentationMeta: (_args, value) => ({
        provider: value.provider,
        model: value.model,
        images: value.images.map(image => ({ ...image })),
      }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec): Promise<GenerationValue> {
      const prompt = args.prompt.trim()
      if (prompt === '') throw new Error('prompt must not be empty')
      if (args.count !== undefined && (!Number.isSafeInteger(args.count) || args.count < 1)) {
        throw new Error('count must be a positive safe integer')
      }
      const route = await resolveImageRoute(ctx, resolved)
      const images: ImageValue[] = []
      const sourceImages = latestHumanImages(exec.agent)
      const request = {
        ...route,
        purpose: 'image-generation' as const,
        imageGeneration: {
          size: args.size,
          quality: args.quality,
          ...args.count === undefined ? {} : { n: args.count },
        },
        messages: [createUserMessage({
          content: [
            { type: 'text', text: prompt },
            ...sourceImages.map(attachment => ({ type: 'image' as const, attachment })),
          ],
          source: { kind: 'plugin', plugin: name },
        })],
        signal: exec.signal,
      }
      for await (const chunk of ctx.llm.stream(request)) {
        if (chunk.type === 'block-end' && chunk.block.type === 'image') images.push(imageValue(chunk.block.attachment))
        if (chunk.type === 'finish' && chunk.reason.kind === 'error') throw new Error(chunk.reason.failure.message)
        if (chunk.type === 'finish' && chunk.reason.kind === 'aborted') throw new Error(chunk.reason.failure.message)
      }
      if (images.length === 0) throw new Error(`image model "${route.model}" returned no images`)
      exec.concludeTurn()
      return { ...route, images }
    },
    presentCall(args) {
      return { card: 'generic', title: 'Generate image', kind: 'other', rawInput: args.prompt }
    },
    presentResult(_args, result: ToolResult) {
      return result.isError ? undefined : { card: 'generic', title: 'Image generated' }
    },
  }))

  ctx.tools.register(defineTool({
    name: ANALYZE_IMAGE_TOOL,
    description: 'Return textual understanding of images attached to the latest human message using the custom provider configured in 插件 > 视觉识别. Use only for description, OCR, comparison, extraction, or visual questions. Do not use this as preparation for image generation or editing; mcp__image__generate_image receives source images directly.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'What to inspect or extract from the image.' },
      images: {
        type: 'array',
        description: 'Optional explicit durable image references. Usually omit this and the latest human image is selected automatically.',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            attachmentId: { type: 'string', required: true },
            mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heif'], required: true },
            bytes: { type: 'integer', required: true },
            width: { type: 'integer', required: true },
            height: { type: 'integer', required: true },
          },
        },
      },
    },
    timeoutMs: resolved.visionTimeoutMs,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          model: { type: 'string', required: true },
          images: { type: 'integer', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
      presentationMeta: (_args, value) => ({ model: value.model, images: value.images }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec): Promise<VisionValue> {
      const active = current() as Required<Config>
      const prompt = args.prompt.trim()
      if (prompt === '') throw new Error('prompt must not be empty')
      const explicit = Array.isArray(args.images) ? args.images as ImageAttachmentRef[] : []
      const refs = explicit.length > 0 ? explicit : latestHumanImages(exec.agent)
      if (refs.length === 0) throw new Error('image understanding requires an image in the latest human message')
      const route = resolveVisionRoute(active)
      const apiKey = await resolveVisionApiKey(ctx, active)
      const images = await Promise.all(refs.map(async (ref) => {
        const stored = await ctx.attachments.readImage(ref, exec.signal)
        return { data: stored.data, mediaType: stored.ref.mediaType }
      }))
      const text = await analyzeWithProvider({
        baseURL: route.baseURL,
        api: route.api as VisionApi,
        model: route.model,
        ...apiKey === undefined ? {} : { apiKey },
        prompt,
        images,
        maxTokens: active.visionMaxTokens,
        signal: exec.signal,
      })
      return { model: route.model, images: refs.length, text }
    },
    presentCall(args) {
      return { card: 'generic', title: 'Analyze image', kind: 'other', rawInput: args.prompt }
    },
    presentResult(_args, result: ToolResult) {
      return result.isError ? undefined : { card: 'generic', title: 'Image analyzed' }
    },
  }))
}

/** Rehydrate a persisted presentation image reference. */
export function imageRef(value: ImageValue): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(value.attachmentId),
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...value.name === undefined ? {} : { name: value.name },
  }
}
