import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply, ANALYZE_IMAGE_TOOL, Config, DEFAULT_IMAGE_MODEL, GENERATE_IMAGE_TOOL } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
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

async function harness(hasImageModel = true): Promise<{ ctx: Context; requests: GenerateOptions[] }> {
  const ctx = new Context()
  contexts.push(ctx)
  const requests: GenerateOptions[] = []
  ctx.provide('llm', {
    listProviders: () => [{ id: hasImageModel ? 'images' : 'text', name: hasImageModel ? 'Images' : 'Text' }],
    listModels: async () => [{
      provider: hasImageModel ? 'images' : 'text',
      id: hasImageModel ? DEFAULT_IMAGE_MODEL : 'text-1',
      name: hasImageModel ? 'Image 2' : 'Text 1',
    }],
    async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      yield { type: 'block-start', index: 0, blockType: 'image' }
      yield imageChunk()
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  } as never)
  ctx.provide('attachments', {} as never)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  apply(ctx, Config({}))
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

  it('uses the latest user image with the configured Qwen vision endpoint', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const image = {
      attachmentId: AttachmentId(`sha256:${'b'.repeat(64)}`),
      mediaType: 'image/png' as const, bytes: 3, width: 1, height: 1,
    }
    const readImage = vi.fn().mockResolvedValue({ ref: image, data: new Uint8Array([1, 2, 3]) })
    ctx.provide('attachments', { readImage } as never)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'A small blue square.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    apply(ctx, Config({ visionApiKey: 'qwen-test-key' }))

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
    expect(readImage).toHaveBeenCalledWith(image, expect.any(AbortSignal))
    expect(fetchMock).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.headers).toMatchObject({ authorization: 'Bearer qwen-test-key' })
    const body = typeof request?.body === 'string' ? request.body : ''
    expect(JSON.parse(body)).toMatchObject({
      model: 'qwen3.7-flash',
      messages: [{ content: [{ type: 'text', text: 'Describe the image briefly.' }, { type: 'image_url' }] }],
    })
    fetchMock.mockRestore()
  })
})
