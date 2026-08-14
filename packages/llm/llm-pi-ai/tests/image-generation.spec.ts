import { afterEach, describe, expect, it, vi } from 'vitest'
import { userAgent } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_OPENAI_IMAGE_GENERATION,
  generateOpenAIImages,
} from '../src/image-generation.ts'

afterEach(() => { vi.unstubAllGlobals() })

const PNG = 'AQID'

function request(overrides: Partial<Parameters<typeof generateOpenAIImages>[0]> = {}) {
  return {
    baseURL: 'https://images.example/v1/',
    model: 'gpt-image-2',
    prompt: 'A lighthouse at dusk',
    apiKey: 'test-key',
    headers: { 'x-team': 'harness' },
    config: DEFAULT_OPENAI_IMAGE_GENERATION,
    maxImageBytes: 10,
    ...overrides,
  }
}

describe('OpenAI image generations', () => {
  it('sends the configured OpenAI image-generation payload and decodes b64_json', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: PNG }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    vi.stubGlobal('fetch', fetch)

    await expect(generateOpenAIImages(request())).resolves.toEqual([{
      data: Uint8Array.of(1, 2, 3), mediaType: 'image/png',
    }])
    expect(fetch).toHaveBeenCalledWith('https://images.example/v1/images/generations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
        'x-team': 'harness',
        'user-agent': userAgent(),
      }),
      body: JSON.stringify({
        model: 'gpt-image-2', prompt: 'A lighthouse at dusk', size: '1024x1024', quality: 'high', n: 1,
        response_format: 'b64_json',
      }),
    }))
  })

  it('downloads URL responses with their verified media type', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.webp' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(Uint8Array.of(4, 5), {
        status: 200,
        headers: { 'content-type': 'image/webp', 'content-length': '2' },
      }))
    vi.stubGlobal('fetch', fetch)

    await expect(generateOpenAIImages(request({
      config: { ...DEFAULT_OPENAI_IMAGE_GENERATION, responseFormat: 'url' },
    }))).resolves.toEqual([{ data: Uint8Array.of(4, 5), mediaType: 'image/webp' }])
    expect(fetch).toHaveBeenLastCalledWith('https://cdn.example/image.webp', expect.objectContaining({
      headers: { accept: 'image/png, image/jpeg, image/webp, image/gif, image/avif, image/heif' },
    }))
  })

  it('edits reference images through multipart image[] fields', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: PNG }] }), {
      status: 200,
    })))
    vi.stubGlobal('fetch', fetch)

    await expect(generateOpenAIImages(request({
      headers: { 'x-team': 'harness', 'content-type': 'application/json' },
      images: [
        { data: Uint8Array.of(4, 5), mediaType: 'image/png' },
        { data: Uint8Array.of(6), mediaType: 'image/jpeg' },
      ],
    }))).resolves.toEqual([{ data: Uint8Array.of(1, 2, 3), mediaType: 'image/png' }])

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://images.example/v1/images/edits')
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-key', 'x-team': 'harness' })
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
    const body = init.body as FormData
    expect(body.get('model')).toBe('gpt-image-2')
    expect(body.get('prompt')).toBe('A lighthouse at dusk')
    expect(body.getAll('image[]').map(file => file instanceof File ? {
      name: file.name, type: file.type,
    } : file)).toEqual([
      { name: 'reference-1.png', type: 'image/png' },
      { name: 'reference-2.jpg', type: 'image/jpeg' },
    ])
  })

  it.each([
    ['a rejected generation response', () => new Response('{}', { status: 401 }), /answered 401/],
    ['a non-JSON generation response', () => new Response('not json', { status: 200 }), /did not answer with JSON/],
    ['an empty generation response', () => new Response('{}', { status: 200 }), /without generated images/],
    ['an invalid base64 response', () => new Response(JSON.stringify({ data: [{ b64_json: 'invalid' }] }), { status: 200 }), /invalid b64_json/],
  ])('rejects %s', async (_name, reply, message) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(reply())))
    await expect(generateOpenAIImages(request())).rejects.toThrow(message)
  })
})
