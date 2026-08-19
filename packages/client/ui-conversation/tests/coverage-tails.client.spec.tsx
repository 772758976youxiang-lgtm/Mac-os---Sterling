// @vitest-environment jsdom
// Branch tails the acceptance specs do not reach: the node-half apply
// without a settings service and AssistantMarkdown reasoning/unknown block arms.

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { apply as nodeApply } from '../src/index.ts'
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx'
import { zh } from '../src/client/locales.ts'

// Mirrors the real lookup chain (conversation namespace, then common).
const t: AssistantMarkdownProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

describe('tails', () => {
  it('node-half apply tolerates a Host without settings', () => {
    expect(() => { nodeApply(new Context()) }).not.toThrow()
  })

  it('AssistantMarkdown renders reasoning as a Think row and unknown blocks as JSON fallback', () => {
    const view = render(
      <AssistantMarkdown
        t={t}
        blocks={[
          { kind: 'reasoning', text: 'thinking hard\nsecond line' },
          { kind: 'tool-call', callId: 'c', name: 'bash', argsRaw: '{}' },
          { kind: 'other', block: { type: 'mystery' } },
        ]}
        streaming
      />,
    )
    expect(view.getByText('思考')).toBeTruthy()
    expect(view.getByText('thinking hard')).toBeTruthy()
    expect(view.getByText(/未知内容块/)).toBeTruthy()
    const stopped = render(
      <AssistantMarkdown t={t} blocks={[{ kind: 'text', text: 'partial words' }]} streaming={false} interrupted />,
    )
    expect(stopped.getByText('已停止')).toBeTruthy()
  })

  it('AssistantMarkdown skips the root shell when only tool-call heads remain', () => {
    // Tool heads are drawn by ChatView's tool groups; an empty root between
    // groups is layout noise (no text, no pulse, no interrupted marker).
    const empty = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'tool-call', callId: 'c', name: 'todo_write', argsRaw: '{}' }]}
        streaming={false}
      />,
    )
    expect(empty.container.firstChild).toBeNull()
    const blank = render(<AssistantMarkdown t={t} blocks={[]} streaming={false} />)
    expect(blank.container.firstChild).toBeNull()
  })

  it('drops reasoning blocks while the show-thinking preference is off', () => {
    const hidden = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'reasoning', text: 'quiet thoughts' }, { kind: 'text', text: 'answer' }]}
        streaming={false}
        showThinking={false}
      />,
    )
    expect(hidden.queryByText('思考')).toBeNull()
    expect(hidden.queryByText('quiet thoughts')).toBeNull()
    expect(hidden.getByText('answer')).toBeTruthy()

    // A node that is only hidden reasoning collapses entirely.
    const only = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'reasoning', text: 'quiet thoughts' }]}
        streaming={false}
        showThinking={false}
      />,
    )
    expect(only.container.firstChild).toBeNull()

    // The same collapse must hold while the step is still streaming: a
    // zero-height shell would otherwise keep consuming the flow column's gap
    // above the tool row that follows the hidden reasoning.
    const running = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'reasoning', text: 'quiet thoughts' }]}
        streaming
        showThinking={false}
      />,
    )
    expect(running.container.firstChild).toBeNull()

    // Streaming tool heads are drawn by the tool-call node, not this shell.
    const toolHeads = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'tool-call', callId: 'c', name: 'bash', argsRaw: '{}' }]}
        streaming
        showThinking={false}
      />,
    )
    expect(toolHeads.container.firstChild).toBeNull()

    // A streaming text answer still paints its shell and pulse.
    const answer = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'text', text: 'partial words' }]}
        streaming
        showThinking={false}
      />,
    )
    expect(answer.getByText('partial words')).toBeTruthy()
  })

  it('renders the image-generation placeholder only while the request is running', () => {
    const active = render(
      <AssistantMarkdown t={t} blocks={[{ kind: 'image-pending' }]} streaming />,
    )
    expect(active.getByRole('status').textContent).toContain('正在生成图片…')
    expect(active.container.querySelector('[data-image-generation-pending]')).toBeTruthy()

    const stopped = render(
      <AssistantMarkdown t={t} blocks={[{ kind: 'image-pending' }]} streaming={false} />,
    )
    expect(stopped.container.firstChild).toBeNull()
  })

})
