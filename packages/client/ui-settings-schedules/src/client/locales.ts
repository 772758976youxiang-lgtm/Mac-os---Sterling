/** Copy dictionaries for scheduled-task settings. */

export const en = {
  nav: 'Scheduled tasks', title: 'Scheduled tasks', intro: 'Manage reminders that run in active sessions.',
  create: 'New task', refresh: 'Refresh', retry: 'Retry', loading: 'Loading scheduled tasks…',
  loadError: 'Scheduled tasks could not be loaded.', emptyTitle: 'No scheduled tasks',
  emptyBody: 'Create a task to have an active session continue work at a specific time.',
  edit: 'Edit task', remove: 'Delete task', close: 'Close', cancel: 'Cancel', save: 'Save', saving: 'Saving…',
  createTitle: 'New scheduled task', editTitle: 'Edit scheduled task', deleteTitle: 'Delete scheduled task?',
  deleteBody: 'This task will no longer run. This action cannot be undone.', deleteConfirm: 'Delete', deleting: 'Deleting…',
  prompt: 'Task', promptPlaceholder: 'Describe what the agent should do', session: 'Session',
  timing: 'Schedule', once: 'Once', recurring: 'Recurring', runAt: 'Run at', interval: 'Repeat every',
  minutes: 'Minutes', hours: 'Hours', days: 'Days', weeks: 'Weeks',
  promptRequired: 'Enter a task.', sessionRequired: 'Choose a session.', futureRequired: 'Choose a future time.',
  intervalInvalid: 'The interval must be at least 5 minutes.', scheduled: 'Scheduled', overdue: 'Overdue',
  oneTime: 'One time', every: 'Every {value} {unit}', nextRun: 'Next run {time}',
  localZone: 'Local time zone: {zone}', currentSession: 'Current', unknownSession: 'Unavailable session',
  saveError: 'The task could not be saved.', deleteError: 'The task could not be deleted.',
} as const

export type SchedulesKey = keyof typeof en

export const zh: Record<SchedulesKey, string> = {
  nav: '定时任务', title: '定时任务', intro: '管理由活跃会话按时执行的提醒任务。',
  create: '新建任务', refresh: '刷新', retry: '重试', loading: '正在加载定时任务…',
  loadError: '无法加载定时任务。', emptyTitle: '暂无定时任务',
  emptyBody: '创建任务，让活跃会话在指定时间继续处理工作。',
  edit: '编辑任务', remove: '删除任务', close: '关闭', cancel: '取消', save: '保存', saving: '保存中…',
  createTitle: '新建定时任务', editTitle: '编辑定时任务', deleteTitle: '删除定时任务？',
  deleteBody: '删除后该任务将不再执行，此操作无法撤销。', deleteConfirm: '删除', deleting: '删除中…',
  prompt: '任务内容', promptPlaceholder: '描述届时需要 Agent 执行的工作', session: '归属会话',
  timing: '执行计划', once: '单次执行', recurring: '重复执行', runAt: '执行时间', interval: '重复间隔',
  minutes: '分钟', hours: '小时', days: '天', weeks: '周',
  promptRequired: '请输入任务内容。', sessionRequired: '请选择归属会话。', futureRequired: '请选择未来的时间。',
  intervalInvalid: '重复间隔不能短于 5 分钟。', scheduled: '已安排', overdue: '已逾期',
  oneTime: '单次任务', every: '每 {value} {unit}', nextRun: '下次执行：{time}',
  localZone: '本地时区：{zone}', currentSession: '当前', unknownSession: '不可用会话',
  saveError: '无法保存该任务。', deleteError: '无法删除该任务。',
}
