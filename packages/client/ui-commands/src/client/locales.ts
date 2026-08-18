/** `command` namespace dictionaries (the popupSelect shell's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'search.placeholder': '搜索…',
  'search.aria': '筛选选项',
  'status.loading': '正在加载选项…',
  'status.applying': '正在应用…',
  'status.empty': '无选项',
  'overlay.aria': '/{command} 选项',
  'listbox.aria': '/{command} 匹配项',
  'desc.compact': '压缩旧对话历史',
  'desc.export': '下载此会话日志为 ZIP 归档',
  'desc.feedback': '记录关于此会话的反馈',
  'desc.goal': '设置或查看长任务的目标',
  'desc.permission': '切换权限预设（沙盒模式 + 审批策略）',
  'desc.plan': '进入或离开计划模式',
} satisfies Record<string, string>

/** The command namespace key union. */
export type CommandKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'search.placeholder': 'Search…',
  'search.aria': 'Filter options',
  'status.loading': 'Loading options…',
  'status.applying': 'Applying…',
  'status.empty': 'No options',
  'overlay.aria': '/{command} options',
  'listbox.aria': '/{command} matches',
  'desc.compact': 'Compact older conversation history',
  'desc.export': 'Download this Session log as a ZIP archive',
  'desc.feedback': 'record feedback about this session',
  'desc.goal': 'set or view the goal for a long-running task',
  'desc.permission': 'Switch the permission preset (sandbox mode + approval policy)',
  'desc.plan': 'Enter or leave plan mode',
} satisfies Record<CommandKey, string>
