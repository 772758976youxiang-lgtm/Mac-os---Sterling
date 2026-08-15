/** Infinite canvas mode and editor dictionaries. */

/** Simplified Chinese dictionary; the key set is the source of truth. */
export const zh = {
  'mode.button': '模式',
  'mode.menu': '选择模式',
  'mode.harness': 'Harness 模式',
  'mode.infinite': '无限创作模式',
  'canvas.aria': '无限创作画布',
  'canvas.addText': '添加文本节点',
  'canvas.back': '返回 Harness 模式',
  'canvas.storageError': '画布保存失败，仍可继续编辑',
  'canvas.newText': '新文本',
  'canvas.nodeLabel': '文本节点',
} satisfies Record<string, string>

/** Locale key union owned by this plugin. */
export type InfiniteCanvasKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  'mode.button': 'Mode',
  'mode.menu': 'Choose mode',
  'mode.harness': 'Harness mode',
  'mode.infinite': 'Infinite creation mode',
  'canvas.aria': 'Infinite creation canvas',
  'canvas.addText': 'Add text node',
  'canvas.back': 'Return to Harness mode',
  'canvas.storageError': 'Canvas save failed; editing is still available',
  'canvas.newText': 'New text',
  'canvas.nodeLabel': 'Text node',
} satisfies Record<InfiniteCanvasKey, string>
