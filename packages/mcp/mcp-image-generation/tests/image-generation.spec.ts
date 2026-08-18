import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  apply, ANALYZE_IMAGE_TOOL, Config, DEFAULT_IMAGE_MODEL, GENERATE_IMAGE_TOOL, IMAGE_GENERATION_SETTINGS_NAMESPACE,
} from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

function imageChunk(): StreamChunk {
  return {
    type: 'block-end', index: 0,
    block: {
      type: 'image',
      attachment: {
        attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
        mediaType: 'image/png', bytes: 9, width: 3, height: 3, name: 'generated.png',
      },
    },
  }
}

async function harness(
  hasImageModel = true,
  config: Config = {},
  withSettings = false,
): Promise<{ ctx: Context; requests: GenerateOptions[] }> {
  const ctx = new Context()
  contexts.push(ctx)
  if (withSettings) await ctx.plugin(MemorySettings).await()
  const requests: GenerateOptions[] = []
  ctx.provide('llm', {
    listProviders: () => [
      { id: hasImageModel ? 'images' : 'text', name: hasImageModel ? 'Images' : 'Text' },
      { id: 'vision', name: 'Vision' },
    ],
    listModels: async (provider: string) => provider === 'vision'
      ? [{ provider, id: 'vision-1', name: 'Vision 1', inputModalities: ['text', 'image'] }]
      : [{
        provider: hasImageModel ? 'images' : 'text',
        id: hasImageModel ? DEFAULT_IMAGE_MODEL : 'text-1',
        name: hasImageModel ? 'Image 2' : 'Text 1',
      }, {
        provider: hasImageModel ? 'images' : 'text',
        id: 'dall-e-3',
        name: 'DALL-E 3',
      }],
    resolveModelInfo: async (provider: string, model: string) => ({
      provider,
      id: model,
      name: model,
      inputModalities: provider === 'vision' ? ['text', 'image'] : ['text'],
    }),
    async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      if (options.provider === 'vision') {
        yield { type: 'text-delta', index: 0, text: 'A small blue square.' }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      yield { type: 'block-start', index: 0, blockType: 'image' }
      yield imageChunk()
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  } as never)
  ctx.provide('attachments', {
    readImage: async (ref: ImageAttachmentRef) => ({
      ref,
      data: new Uint8Array([1, 2, 3]),
    }),
    saveImage: async (input: { data: Uint8Array; mediaType: ImageAttachmentRef['mediaType']; name?: string }) => ({
      attachmentId: AttachmentId(`sha256:${'b'.repeat(64)}`),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
      name: input.name ?? 'generated.png',
    }),
  } as never)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  apply(ctx, Config(config))
  return { ctx, requests }
}

describe('mcp-image-generation', () => {
  it('registers an MCP-namespaced image tool using the configured image route', async () => {
    const { ctx, requests } = await harness()
    expect(ctx.tools.get(GENERATE_IMAGE_TOOL)).toMatchObject({ name: GENERATE_IMAGE_TOOL })

    const result = await ctx.tools.execute({
      callId: 'image-1' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: {
        prompt: 'A cobalt kingfisher on a branch',
        size: '1536x1024',
        quality: 'medium',
        count: 2,
      },
      signal: AbortSignal.timeout(1_000),
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      provider: 'images', model: DEFAULT_IMAGE_MODEL, purpose: 'image-generation',
      imageGeneration: { size: '1536x1024', quality: 'medium', n: 2 },
      messages: [{ source: { kind: 'plugin', plugin: 'mcp-image-generation' } }],
    })
    expect(requests[0]?.messages[0]?.content).toEqual([{ type: 'text', text: 'A cobalt kingfisher on a branch' }])
    expect(result).toMatchObject({ isError: false, meta: { images: [{ name: 'generated.png' }] } })
    if (result.isError) throw new Error('expected image generation success')
    expect(result.concludesTurn).toBe(true)
    expect(result.content).toEqual([{
      type: 'text',
      text: 'Generated 1 image with gpt-image-2 on images. The image is already attached to this result and displayed in the conversation; do not search for, copy, or analyze it unless the user explicitly asks.',
    }])
  })

  it('reads the live settings model instead of the mount-time default', async () => {
    const { ctx, requests } = await harness(true, { model: DEFAULT_IMAGE_MODEL }, true)

    await ctx.settings.update(settingsNamespace(IMAGE_GENERATION_SETTINGS_NAMESPACE), { model: 'dall-e-3' })

    const result = await ctx.tools.execute({
      callId: 'image-live-1' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'a cyan heron', size: '1024x1024', quality: 'high' },
      signal: AbortSignal.timeout(1_000),
    })

    expect(requests[0]).toMatchObject({ provider: 'images', model: 'dall-e-3', purpose: 'image-generation' })
    if (result.isError) throw new Error('expected image generation with the live model')
  })

  it('generates through a configured custom Image API provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await harness(true, {
      imageProvider: 'acme-images',
      imageBaseURL: 'https://image.example/v1',
      model: 'image-gen-2',
    })

    const result = await ctx.tools.execute({
      callId: 'image-custom-1' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'a ginger cat', size: '1536x1024', quality: 'high', count: 1 },
      signal: AbortSignal.timeout(1_000),
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://image.example/v1/images/generations')
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((request.headers as Record<string, string>)['content-type']).toBe('application/json')
    const body = JSON.parse(String(request.body))
    expect(body).toMatchObject({
      model: 'image-gen-2', prompt: 'a ginger cat', size: '1536x1024', quality: 'high', n: 1, response_format: 'b64_json',
    })
    expect(result).toMatchObject({ isError: false })
    if (result.isError) throw new Error('expected custom-provider image generation success')
    expect(result.meta).toMatchObject({ provider: 'acme-images', model: 'image-gen-2' })
  })

  it.each([
    ['openai-completions', 'https://gateway.example/v1/chat/completions'],
    ['openai-responses', 'https://gateway.example/v1/responses'],
    ['anthropic-messages', 'https://gateway.example/v1/messages'],
  ] as const)('generates through a %s endpoint that returns Image-API-shaped data', async (api, endpoint) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await harness(true, {
      imageProvider: 'acme-images',
      imageBaseURL: 'https://gateway.example/v1',
      imageApi: api,
      model: `image-${api}`,
    })

    const result = await ctx.tools.execute({
      callId: `image-${api}` as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'a red fox', size: '1024x1024', quality: 'high' },
      signal: AbortSignal.timeout(1_000),
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(endpoint)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.model).toBe(`image-${api}`)
    // The model-chosen controls reach the gateway on every protocol.
    expect(body).toMatchObject({ size: '1024x1024', quality: 'high' })
    expect(result).toMatchObject({ isError: false })
    if (result.isError) throw new Error(`expected ${api} image generation success`)
  })

  it('surfaces the gateway error detail when the custom provider refuses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'model gpt is not an image model' } }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await harness(true, {
      imageProvider: 'acme-images',
      imageBaseURL: 'https://rayplus.site/v1',
      imageApi: 'openai-completions',
      model: 'gpt',
    })

    const result = await ctx.tools.execute({
      callId: 'image-refused-1' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'a kitten', size: '1024x1024', quality: 'high' },
      signal: AbortSignal.timeout(1_000),
    })

    expect(result.isError).toBe(true)
    if (!result.isError) throw new Error('expected the custom provider to refuse')
    expect(result.error.message).toContain('https://rayplus.site/v1/chat/completions answered 502')
    expect(result.error.message).toContain('model gpt is not an image model')
  })

  it('generates through a chat-completions gateway that returns image URLs', async () => {
    const chatReply = JSON.stringify({
      choices: [{
        message: { content: [{ type: 'image_url', image_url: { url: 'https://img.example/out.png' } }] },
      }],
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(chatReply, { status: 200, headers: { 'content-type': 'application/json' } }))
      // The image URL fetch resolves the raster bytes.
      .mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await harness(true, {
      imageProvider: 'acme-images',
      imageBaseURL: 'https://gateway.example/v1',
      imageApi: 'openai-completions',
      model: 'image-chat-1',
    })

    const result = await ctx.tools.execute({
      callId: 'image-chat-1' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'a sleeping panda', size: '1024x1024', quality: 'high' },
      signal: AbortSignal.timeout(1_000),
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gateway.example/v1/chat/completions')
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      model: 'image-chat-1', n: 1, size: '1024x1024', quality: 'high',
      messages: [{ role: 'user', content: 'a sleeping panda' }],
    })
    expect(result).toMatchObject({ isError: false })
  })

  it('forwards images from the newest human message past injected runtime context', async () => {
    const { ctx, requests } = await harness()
    const source = {
      attachmentId: AttachmentId(`sha256:${'c'.repeat(64)}`),
      mediaType: 'image/jpeg' as const, bytes: 12, width: 4, height: 3,
    }
    const result = await ctx.tools.execute({
      callId: 'image-edit-1' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: '把这张图改成水彩风格', size: '1024x1536', quality: 'high' },
      agent: {
        session: {
          deriveMessages: () => [{
            role: 'user', source: { kind: 'user' }, content: [
              { type: 'text', text: '把这张图改成水彩风格' },
              { type: 'image', attachment: source },
            ],
          }, {
            role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: 'Runtime policy snapshot' }],
          }, {
            role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: 'Current time snapshot' }],
          }],
        },
      } as never,
      signal: AbortSignal.timeout(1_000),
    })

    expect(result).toMatchObject({ isError: false })
    expect(requests[0]?.imageGeneration).toEqual({ size: '1024x1536', quality: 'high' })
    expect(requests[0]?.messages[0]?.content).toEqual([
      { type: 'text', text: '把这张图改成水彩风格' },
      { type: 'image', attachment: source },
    ])
  })

  it('does not reuse an older image after a newer text-only user message', async () => {
    const { ctx, requests } = await harness()
    const source = {
      attachmentId: AttachmentId(`sha256:${'d'.repeat(64)}`),
      mediaType: 'image/png' as const, bytes: 12, width: 4, height: 3,
    }
    await ctx.tools.execute({
      callId: 'image-edit-2' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: '只根据文字生成', size: '1024x1024', quality: 'auto' },
      agent: {
        session: {
          deriveMessages: () => [
            { role: 'user', source: { kind: 'user' }, content: [{ type: 'image', attachment: source }] },
            { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '只根据文字生成' }] },
            { role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: 'Current time snapshot' }] },
          ],
        },
      } as never,
      signal: AbortSignal.timeout(1_000),
    })

    expect(requests[0]?.messages[0]?.content).toEqual([{ type: 'text', text: '只根据文字生成' }])
  })

  it('fails clearly when no configured provider owns the image model', async () => {
    const { ctx } = await harness(false)
    const result = await ctx.tools.execute({
      callId: 'image-2' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'A missing image route', size: 'auto', quality: 'low' },
      signal: AbortSignal.timeout(1_000),
    })
    expect(result).toMatchObject({ isError: true })
    const first = result.content[0]
    expect(first?.type).toBe('text')
    if (first?.type === 'text') expect(first.text).toContain('image generation is unavailable')
  })

  it('rejects a non-positive image count before dispatch', async () => {
    const { ctx, requests } = await harness()
    const result = await ctx.tools.execute({
      callId: 'image-count' as never,
      name: GENERATE_IMAGE_TOOL,
      arguments: { prompt: 'One image', size: '1024x1024', quality: 'high', count: 0 },
      signal: AbortSignal.timeout(1_000),
    })

    expect(result).toMatchObject({ isError: true })
    expect(requests).toHaveLength(0)
    expect(result.content).toEqual([{ type: 'text', text: 'Error: count must be a positive safe integer' }])
  })

  it('routes the latest user image through the custom OpenAI-compatible provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'A small blue square.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await harness(true, {
      visionProvider: 'vision-gateway',
      visionBaseURL: 'https://vision.example/v1',
      visionModel: 'vision-1',
      visionApiKeyEnv: 'VISION_GATEWAY_API_KEY',
    })
    const image = {
      attachmentId: AttachmentId(`sha256:${'b'.repeat(64)}`),
      mediaType: 'image/png' as const, bytes: 3, width: 1, height: 1,
    }
    const result = await ctx.tools.execute({
      callId: 'vision-1' as never,
      name: ANALYZE_IMAGE_TOOL,
      arguments: { prompt: 'Describe the image briefly.' },
      agent: {
        session: {
          deriveMessages: () => [
            { role: 'user', source: { kind: 'user' }, content: [{ type: 'image', attachment: image }] },
            { role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: 'Current time snapshot' }] },
          ],
        },
      } as never,
      signal: AbortSignal.timeout(1_000),
    })

    expect(result).toMatchObject({ isError: false, content: [{ type: 'text', text: 'A small blue square.' }] })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://vision.example/v1/chat/completions')
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(request.headers).not.toHaveProperty('authorization')
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'vision-1', max_tokens: 2_048,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe the image briefly.' },
        { type: 'image_url' },
      ] }],
    })
  })

  it.each([
    ['openai-completions', 'https://vision.example/v1/chat/completions'],
    ['openai-responses', 'https://vision.example/v1/responses'],
    ['anthropic-messages', 'https://vision.example/v1/messages'],
  ] as const)('uses the %s visual protocol', async (api, endpoint) => {
    const response = api === 'openai-responses'
      ? { output_text: 'A response image.' }
      : api === 'anthropic-messages'
        ? { content: [{ type: 'text', text: 'An Anthropic image.' }] }
        : { choices: [{ message: { content: 'A chat image.' } }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await harness(true, {
      visionProvider: 'vision-gateway',
      visionBaseURL: 'https://vision.example/v1',
      visionApi: api,
      visionModel: 'vision-1',
    })
    const image = {
      attachmentId: AttachmentId(`sha256:${'f'.repeat(64)}`),
      mediaType: 'image/png' as const, bytes: 3, width: 1, height: 1,
    }
    const result = await ctx.tools.execute({
      callId: `vision-${api}` as never,
      name: ANALYZE_IMAGE_TOOL,
      arguments: { prompt: 'Describe the image.' },
      agent: { session: { deriveMessages: () => [{
        role: 'user', source: { kind: 'user' }, content: [{ type: 'image', attachment: image }],
      }] } } as never,
      signal: AbortSignal.timeout(1_000),
    })

    expect(result).toMatchObject({ isError: false })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(endpoint)
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(request.body)) as Record<string, unknown>
    expect(body.model).toBe('vision-1')
    if (api === 'anthropic-messages') {
      expect(request.headers).not.toHaveProperty('x-api-key')
      expect(request.headers).not.toHaveProperty('anthropic-version')
      expect(body.messages).toBeTruthy()
    } else if (api === 'openai-responses') {
      expect(body.input).toBeTruthy()
    } else {
      expect(body.messages).toBeTruthy()
    }
  })

  it('requires a configured image-capable model for visual understanding', async () => {
    const { ctx } = await harness()
    const image = {
      attachmentId: AttachmentId(`sha256:${'e'.repeat(64)}`),
      mediaType: 'image/png' as const, bytes: 3, width: 1, height: 1,
    }
    const result = await ctx.tools.execute({
      callId: 'vision-missing-route' as never,
      name: ANALYZE_IMAGE_TOOL,
      arguments: { prompt: 'Describe the image.' },
      agent: { session: { deriveMessages: () => [{
        role: 'user', source: { kind: 'user' }, content: [{ type: 'image', attachment: image }],
      }] } } as never,
      signal: AbortSignal.timeout(1_000),
    })

    expect(result).toMatchObject({ isError: true })
    const first = result.content[0]
    expect(first?.type).toBe('text')
    if (first?.type === 'text') expect(first.text).toContain('complete the custom provider')
  })
})
