import { memo, useMemo } from 'react'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import { messageImageLabels } from '../image-labels.ts'
import css from './ChatView.module.css'

interface ChatNodeSeatProps extends ChatNodeOwnerProps {
  readonly nodeKey: string
  readonly showContextInjections: boolean
  readonly showToolCalls: boolean
  readonly showThinking: boolean
  readonly useSession: ChatViewSlotProps['useSession']
  readonly renderSlot: ChatViewSlotProps['renderSlot']
  readonly t: ChatViewSlotProps['t']
}

type RoutedChatNodeOwner = {
  [Kind in ChatNode['kind']]: ChatNodeOwnerProps & { readonly node: ChatNode<Kind> }
}[ChatNode['kind']]

/** Read the durable image facts a tool result projected into its metadata. */
function toolResultImages(node: ChatNode<'tool-call'>): ImageAttachmentRef[] {
  const root = (node.data as { root?: { meta?: unknown } }).root
  const meta = root?.meta
  if (typeof meta !== 'object' || meta === null || !Array.isArray((meta as { images?: unknown }).images)) return []
  const images: ImageAttachmentRef[] = []
  for (const item of (meta as { images: unknown[] }).images) {
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>
    const type = value.mediaType === 'image/png' || value.mediaType === 'image/jpeg'
      || value.mediaType === 'image/webp' || value.mediaType === 'image/gif'
      || value.mediaType === 'image/avif' || value.mediaType === 'image/heif'
      ? value.mediaType as ImageMediaType
      : undefined
    if (typeof value.attachmentId !== 'string' || type === undefined
      || typeof value.bytes !== 'number' || typeof value.width !== 'number' || typeof value.height !== 'number'
      || !Number.isSafeInteger(value.bytes) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)) {
      continue
    }
    images.push({
      attachmentId: value.attachmentId as ImageAttachmentRef['attachmentId'],
      mediaType: type,
      bytes: value.bytes,
      width: value.width,
      height: value.height,
      ...typeof value.name === 'string' ? { name: value.name } : {},
    })
  }
  return images
}

/** Subscribe and dispatch one stable Context key without observing sibling Nodes. */
export const ChatNodeSeat = memo(function ChatNodeSeat({
  nodeKey, selectedCallId, cwd, openFile, inspectCall, forkAt,
  loadImage, fileMentions, showContextInjections, showToolCalls, showThinking, useSession, renderSlot, t,
}: ChatNodeSeatProps) {
  const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey))
  const routedNode = node as ChatNode | undefined
  const owner = useMemo<ChatNodeOwnerProps | null>(() => node === undefined
    ? null
    : {
      selectedCallId,
      cwd,
      openFile,
      inspectCall,
      forkAt,
      loadImage,
      fileMentions,
      showThinking,
    }, [node, selectedCallId, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions, showThinking])
  if (routedNode === undefined || owner === null) return null
  if (routedNode.kind === 'context' && !showContextInjections) return null
  if (routedNode.kind === 'tool-call' && !showToolCalls) {
    // Hiding tool-call chrome must not hide the output the tool produced: a
    // generation result's images are the user-facing answer, so they stay in
    // the transcript as a bare gallery when the preference is off.
    const images = toolResultImages(routedNode)
    if (images.length === 0) return null
    return (
      <div
        className={css.flowItem}
        data-chat-anchor-key={routedNode.key}
        data-chat-flow-key={routedNode.key}
        data-chat-flow-kind={routedNode.kind}
      >
        <ImageGallery
          images={images.map(attachment => ({ attachment }))}
          load={loadImage}
          align="start"
          labels={messageImageLabels(t)}
        />
      </div>
    )
  }
  // Runtime dispatch owns the correlation: every Node's discriminant is the
  // keyed-slot entry passed alongside that same Node. TypeScript does not
  // distribute an object containing a union into a union of objects itself.
  const routedOwner = { ...owner, node: routedNode } as RoutedChatNodeOwner
  return (
    <div
      className={css.flowItem}
      data-chat-anchor-key={routedNode.key}
      data-chat-flow-key={routedNode.key}
      data-chat-flow-kind={routedNode.kind}
    >
      {renderSlot('conversation.chat.node', routedOwner, {
        entryKey: routedNode.kind,
        hookContext: nodeKey,
        fallback: (
          <JsonBlock
            label={t('message.unknownSurface', { type: routedNode.kind })}
            payload={routedNode.data}
            truncatedLabel={total => t('json.truncated', { total })}
          />
        ),
      })}
    </div>
  )
})
