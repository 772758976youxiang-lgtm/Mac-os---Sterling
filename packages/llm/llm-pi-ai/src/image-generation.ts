/** OpenAI-compatible image-generation request and response conversion. */

import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** Wire protocol identifier for OpenAI's `POST /images/generations` endpoint. */
export const OPENAI_IMAGE_GENERATIONS_API = 'openai-image-generations'

/** Per-route controls supported by OpenAI-compatible image-generation endpoints. */
export interface OpenAIImageGenerationConfig {
  /** Image dimensions sent as `size`. */
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto'
  /** Quality tier sent as `quality`. */
  quality?: 'low' | 'medium' | 'high' | 'auto'
  /** Number of images requested from one prompt. */
  n?: number
  /** Response encoding requested from the provider. */
  responseFormat?: 'b64_json' | 'url'
}

/** Fully resolved image-generation controls. */
export interface ResolvedOpenAIImageGenerationConfig {
  size: NonNullable<OpenAIImageGenerationConfig['size']>
  quality: NonNullable<OpenAIImageGenerationConfig['quality']>
  n: number
  responseFormat: NonNullable<OpenAIImageGenerationConfig['responseFormat']>
}

/** Defaults mirror the supplied OpenAI image-generation invocation. */
export const DEFAULT_OPENAI_IMAGE_GENERATION: Readonly<ResolvedOpenAIImageGenerationConfig> = Object.freeze({
  size: '1024x1024',
  quality: 'high',
  n: 1,
  responseFormat: 'b64_json',
})

/** One fully decoded generated image ready for durable attachment storage. */
export interface GeneratedImage {
  data: Uint8Array
  mediaType: ImageMediaType
}

/** One durable user image, resolved to bytes for an OpenAI image-edit request. */
export interface OpenAIImageEditInput {
  data: Uint8Array
  mediaType: ImageMediaType
}

interface ImageResponseEntry {
  b64_json?: unknown
  url?: unknown
}

interface ImageResponse {
  data?: unknown
}

/** Construct an Image API endpoint without dropping a deployment's path prefix. */
function imageApiUrl(baseURL: string, path: 'generations' | 'edits'): string {
  return `${baseURL.replace(/\/+$/, '')}/images/${path}`
}

function imageExtension(mediaType: ImageMediaType): string {
  switch (mediaType) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    case 'image/avif': return 'avif'
    case 'image/heif': return 'heif'
  }
}

/** Do not let a configured JSON media type hide the FormData boundary. */
function multipartHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'content-type'))
}

/** Convert a provider-declared image content type into attachment vocabulary. */
function imageMediaType(contentType: string | null): ImageMediaType {
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType === 'image/png' || mediaType === 'image/jpeg' || mediaType === 'image/webp' || mediaType === 'image/gif'
    || mediaType === 'image/avif' || mediaType === 'image/heif') {
    return mediaType
  }
  throw new LlmError('the image URL did not return a supported image content type', 'IMAGE_GENERATION_FAILED')
}

/** Read one image URL under the attachment service's encoded-byte limit. */
async function readImageUrl(url: string, signal: AbortSignal | undefined, maxBytes: number): Promise<GeneratedImage> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'image/png, image/jpeg, image/webp, image/gif, image/avif, image/heif' },
      ...signal === undefined ? {} : { signal },
    })
  } catch (error: unknown) {
    throw new LlmError('could not download the generated image', 'IMAGE_GENERATION_FAILED', { cause: error })
  }
  if (!response.ok) {
    throw new LlmError(`the generated image URL answered ${response.status}`, 'IMAGE_GENERATION_FAILED', { status: response.status })
  }
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw new LlmError('the generated image exceeds the attachment size limit', 'IMAGE_GENERATION_FAILED')
  }
  if (response.body === null) throw new LlmError('the generated image URL returned no body', 'IMAGE_GENERATION_FAILED')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new LlmError('the generated image exceeds the attachment size limit', 'IMAGE_GENERATION_FAILED')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {
      // A drained response has already settled; cancellation only releases a partially read body.
    })
  }
  const data = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { data, mediaType: imageMediaType(response.headers.get('content-type')) }
}

/** Decode a `b64_json` image and reject malformed or over-limit payloads. */
function decodeBase64(value: unknown, maxBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new LlmError('the image-generation response has an invalid b64_json image', 'IMAGE_GENERATION_FAILED')
  }
  const maximumBase64Bytes = Math.ceil(maxBytes / 3) * 4
  if (value.length > maximumBase64Bytes) {
    throw new LlmError('the generated image exceeds the attachment size limit', 'IMAGE_GENERATION_FAILED')
  }
  const data = Uint8Array.from(Buffer.from(value, 'base64'))
  if (data.byteLength === 0 || data.byteLength > maxBytes) {
    throw new LlmError('the generated image exceeds the attachment size limit', 'IMAGE_GENERATION_FAILED')
  }
  return data
}

/**
 * Call an OpenAI-compatible image-generation endpoint.
 * @param input - endpoint, credentials, prompt, and resolved generation controls.
 * @returns decoded image bytes in provider response order.
 */
export async function generateOpenAIImages(input: {
  baseURL: string
  model: string
  prompt: string
  apiKey?: string
  headers: Record<string, string>
  config: ResolvedOpenAIImageGenerationConfig
  /** Reference-image bytes; when present the request is an Image API edit. */
  images?: readonly OpenAIImageEditInput[]
  signal?: AbortSignal
  maxImageBytes: number
}): Promise<GeneratedImage[]> {
  const inputImages = input.images ?? []
  const edits = inputImages.length > 0
  const url = imageApiUrl(input.baseURL, edits ? 'edits' : 'generations')
  const requestBody = edits
    ? (() => {
      const form = new FormData()
      form.set('model', input.model)
      form.set('prompt', input.prompt)
      form.set('size', input.config.size)
      form.set('quality', input.config.quality)
      form.set('n', String(input.config.n))
      form.set('response_format', input.config.responseFormat)
      for (const [index, image] of inputImages.entries()) {
        const bytes = new Uint8Array(image.data.byteLength)
        bytes.set(image.data)
        form.append(
          'image[]',
          new Blob([bytes.buffer], { type: image.mediaType }),
          `reference-${String(index + 1)}.${imageExtension(image.mediaType)}`,
        )
      }
      return form
    })()
    : JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: input.config.size,
      quality: input.config.quality,
      n: input.config.n,
      response_format: input.config.responseFormat,
    })
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        ...input.apiKey === undefined ? {} : { authorization: `Bearer ${input.apiKey}` },
        ...edits ? multipartHeaders(input.headers) : { 'content-type': 'application/json', ...input.headers },
        ...attributionHeaders(),
      },
      body: requestBody,
      ...input.signal === undefined ? {} : { signal: input.signal },
    })
  } catch (error: unknown) {
    throw new LlmError(`could not reach ${url}`, 'IMAGE_GENERATION_FAILED', { cause: error })
  }
  if (!response.ok) {
    throw new LlmError(`${url} answered ${response.status}`, 'IMAGE_GENERATION_FAILED', { status: response.status })
  }
  let responseBody: ImageResponse
  try {
    responseBody = await response.json() as ImageResponse
  } catch (error: unknown) {
    throw new LlmError(`${url} did not answer with JSON`, 'IMAGE_GENERATION_FAILED', { cause: error })
  }
  if (!Array.isArray(responseBody.data) || responseBody.data.length === 0) {
    throw new LlmError(`${url} answered without generated images`, 'IMAGE_GENERATION_FAILED')
  }
  const images: GeneratedImage[] = []
  for (const entry of responseBody.data as ImageResponseEntry[]) {
    if (typeof entry?.b64_json === 'string') {
      images.push({ data: decodeBase64(entry.b64_json, input.maxImageBytes), mediaType: 'image/png' })
      continue
    }
    if (typeof entry?.url === 'string') {
      images.push(await readImageUrl(entry.url, input.signal, input.maxImageBytes))
      continue
    }
    throw new LlmError(`${url} returned an image with neither b64_json nor url`, 'IMAGE_GENERATION_FAILED')
  }
  return images
}
