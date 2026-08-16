/** Visual tool row for the local image-generation MCP bridge. */

import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import { IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import { toolRowModel } from '../models/tool-call-model.ts'
import { ToolRow } from '../components/ToolRow.tsx'
import { CONVERSATION_NS as NS } from '../../locale.ts'
import css from './image-generation-row.module.css'

/** Tool wire contract shared by the host-side local MCP bridge. */
export const IMAGE_GENERATION_TOOL = 'mcp__image__generate_image'

type ImageGenerationRowProps = ToolCallViewProps & PropsLocale<'conversation'>

function mediaType(value: unknown): ImageMediaType | undefined {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
    || value === 'image/gif' || value === 'image/avif' || value === 'image/heif' ? value : undefined
}

/** Read only the durable image facts projected into the tool result metadata. */
export function imageGenerationImages(meta: unknown): ImageAttachmentRef[] {
  if (typeof meta !== 'object' || meta === null || !Array.isArray((meta as { images?: unknown }).images)) return []
  const images: ImageAttachmentRef[] = []
  for (const item of (meta as { images: unknown[] }).images) {
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>
    const type = mediaType(value.mediaType)
    if (typeof value.attachmentId !== 'string' || type === undefined
      || typeof value.bytes !== 'number' || typeof value.width !== 'number' || typeof value.height !== 'number'
      || !Number.isSafeInteger(value.bytes) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)) continue
    images.push({
      attachmentId: value.attachmentId as ImageAttachmentRef['attachmentId'], mediaType: type,
      bytes: value.bytes, width: value.width, height: value.height,
      ...typeof value.name === 'string' ? { name: value.name } : {},
    })
  }
  return images
}

/** Render successful image attachments inline while failures retain the expandable result details. */
export function ImageGenerationRow({ toolName, block, loadImage, inspect, t }: ImageGenerationRowProps) {
  const model = toolRowModel(toolName, block)
  const images = 'kind' in block && !block.isError ? imageGenerationImages(block.meta) : []
  return (
    <div className={css.root} data-image-generation-result>
      {images.length === 0 && (
        <ToolRow
          t={t}
          variant="others"
          toolName={toolName}
          icon={<IconSparkle16 size={14} />}
          title="生成图片"
          summary={model.summary}
          body={null}
          output={model.output}
          errorSummary={model.errorSummary}
          state={model.state}
          inspect={inspect}
        />
      )}
      {images.length > 0 && (
        <div className={css.output} data-image-generation-output>
          <ImageGallery images={images.map(attachment => ({ attachment }))} load={loadImage} align="start" labels={{
            image: t('image.label'), open: t('image.openOriginal'),
            openNamed: label => t('image.openOriginalLabel', { label }), loading: t('image.loading'),
            loadFailed: t('image.loadFailed'), lightbox: { dialog: t('image.preview'), close: t('image.closePreview') },
          }} />
        </div>
      )}
    </div>
  )
}

/** Register the local MCP image tool's inline result view. */
export const imageGenerationToolview = {
  name: 'image-generation-toolview',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: IMAGE_GENERATION_TOOL, locale: NS }, ImageGenerationRow))
  },
}
