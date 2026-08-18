import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply, ANALYZE_IMAGE_TOOL, Config, DEFAULT_IMAGE_MODEL, GENERATE_IMAGE_TOOL } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

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
): Promise<{ ctx: Context; requests: GenerateOptions[] }> {
  const ctx = new Context()
  contexts.push(ctx)
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
    ['minimax-h3', 'https://vision.example/v1/chat/completions'],
    ['openai-responses', 'https://vision.example/v1/responses'],
    ['anthropic-messages', 'https://vision.example/v1/messages'],
  ] as const)('uses the %s visual protocol', async (api, endpoint) => {
    const response = api === 'openai-responses'
      ? { output_text: 'A response image.' }
      : api === 'anthropic-messages'
        ? { content: [{ type: 'text', text: 'An Anthropic image.' }] }
        : { choices: [{ message: { content: 'A MiniMax image.' } }] }
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
