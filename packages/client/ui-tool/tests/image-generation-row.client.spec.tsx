// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { ImageGenerationRow, imageGenerationImages } from '../src/client/tool/toolviews/image-generation-row.tsx'

afterEach(cleanup)

describe('imageGenerationImages', () => {
  it('accepts only complete durable image references from tool presentation metadata', () => {
    expect(imageGenerationImages({
      images: [
        { attachmentId: `sha256:${'b'.repeat(64)}`, mediaType: 'image/png', bytes: 10, width: 2, height: 5, name: 'art.png' },
        { attachmentId: 'bad', mediaType: 'text/plain', bytes: 10, width: 2, height: 5 },
      ],
    })).toEqual([{
      attachmentId: `sha256:${'b'.repeat(64)}`, mediaType: 'image/png', bytes: 10, width: 2, height: 5, name: 'art.png',
    }])
  })

  it('renders a successful generated image without a redundant tool row', async () => {
    const attachment = {
      attachmentId: `sha256:${'b'.repeat(64)}` as never,
      mediaType: 'image/png' as const,
      bytes: 10,
      width: 2,
      height: 5,
      name: 'art.png',
    }
    const block: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3_000, callId: 'image-1',
      call: { name: 'mcp__image__generate_image', argsRaw: '{"prompt":"画一只小狗"}' },
      callTime: 2_000, content: [{ type: 'text', text: 'Generated 1 image.' }],
      isError: false, meta: { images: [attachment] }, callView: null, resultView: null, subCalls: [],
    }
    const loadImage = vi.fn(() => Promise.resolve('blob:generated-image'))
    const view = render(<ImageGenerationRow {...({
      toolName: 'mcp__image__generate_image', block, loadImage, inspect: vi.fn(),
      t: makeTranslate(zh, commonZh),
    } as unknown as Parameters<typeof ImageGenerationRow>[0])} />)

    expect(view.queryByText('生成图片')).toBeNull()
    expect(view.container.querySelector('[data-image-generation-output]')).not.toBeNull()
    expect(view.container.querySelector('[aria-expanded]')).toBeNull()
    await waitFor(() => {
      expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:generated-image')
    })
    expect(loadImage).toHaveBeenCalledWith(attachment)
  })

  it('keeps the tool row when generation fails and there is no image to show', () => {
    const block: ToolResultNode = {
      kind: 'tool-result', seq: 4, time: 4_000, callId: 'image-2',
      call: {
        name: 'mcp__image__generate_image',
        argsRaw: '{"prompt":"画一只小狗","size":"1024x1024","quality":"high"}',
      },
      callTime: 3_000,
      content: [{ type: 'text', text: 'image generation failed' }],
      isError: true, meta: null, callView: null, resultView: null, subCalls: [],
    }
    const view = render(<ImageGenerationRow {...({
      toolName: 'mcp__image__generate_image', block, loadImage: vi.fn(), inspect: vi.fn(),
      t: makeTranslate(zh, commonZh),
    } as unknown as Parameters<typeof ImageGenerationRow>[0])} />)

    expect(view.getByText('生成图片')).toBeTruthy()
    expect(view.container.querySelector('[data-image-generation-output]')).toBeNull()
  })
})
