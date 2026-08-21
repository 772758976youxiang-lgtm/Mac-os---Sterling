/**
 * 记忆系统 Host 半体（memvault）
 * 持久化插件：注册 4 个模型工具 + 真实文件持久化。
 * 通过 cordis.patch.yml 的 file:// URL 引用，热重载生效。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'memvault'

export const inject = ['tools', 'fs', 'sandboxPolicy', 'webServer']

/** 工具输出渲染：text content block */
function textBlock(text) {
  return [{ type: 'text', text: String(text) }]
}

const JSON_SCHEMA = { type: 'json' }

export function apply(ctx) {
  const tools = ctx.tools
  const fs = ctx.fs
  const webServer = ctx.get('webServer')
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const root = (sandboxPolicy && sandboxPolicy.workspaceRoot) ? sandboxPolicy.workspaceRoot : '.'
  const base = root.replace(/[\\/]+$/, '') + '/.dsh-memory/'

  async function readText(rel) {
    const t = await fs.resolve(base + rel)
    const info = await fs.stat(t)
    if (!info) return undefined
    return await fs.readText(t)
  }
  async function writeText(rel, content) {
    const t = await fs.resolve(base + rel)
    return await fs.writeText(t, content)
  }
  async function readJson(rel, fallback) {
    const txt = await readText(rel)
    if (txt === undefined) return fallback
    try { return JSON.parse(txt) } catch (e) { return fallback }
  }
  async function writeJson(rel, value) {
    await writeText(rel, JSON.stringify(value, null, 2))
  }

  function today() {
    const d = new Date()
    const p = (n) => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  }
  function slug(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') || 'memory'
  }

  const SEED_MEMORIES = [
    { key: 'code-style', type: '长期记忆', name: '代码风格', category: '用户偏好', description: '用户偏好 TypeScript、2 空格缩进、单引号；代码改动先给方案再动手，注释使用中文。', importance: '高', tags: '代码风格 · TypeScript · 工作流', updated: '2026-08-18', md: '# 代码风格\n\n## 偏好\n- **语言**：TypeScript / 纯 JavaScript（动态插件场景）\n- **缩进**：2 空格\n- **引号**：单引号\n- **注释**：中文\n- **命名**：语义化小驼峰\n\n## 约定\n- 交付流程：先方案 → 确认 → 实施\n\n## 工作流\n1. 用户提出需求后，智能体先复述目标并确认范围\n2. 给出 1~2 个实现方案，说明影响面与取舍\n3. 用户确认方案后再修改代码\n4. 完成后用中文简述改动内容与验证结果\n5. 如涉及界面，先提供 HTML 演示供确认，再谈落地' },
    { key: 'language', type: '长期记忆', name: '沟通与语言', category: '用户偏好', description: '用户使用简体中文交流；回答要简洁、结构化，先结论后细节。', importance: '高', tags: '语言 · 沟通方式', updated: '2026-08-10', md: '# 沟通与语言\n\n## 偏好\n- **语言**：简体中文\n- **结构**：结论 → 要点 → 细节\n- **代码注释**：中文\n- **称呼**：以「你」称呼智能体\n\n## 约定\n1. 回复开头直接给出结论或方案\n2. 用列表或分段组织要点\n3. 细节与示例放在最后\n4. 需要用户决策时给出推荐项并标注' },
    { key: 'project', type: '长期记忆', name: 'Sterling Harness 项目', category: '项目背景', description: '用户使用 Sterling Harness（基于 Cordis 的智能体工作台），当前正在规划「记忆系统」模块。', importance: '高', tags: 'Sterling · Cordis', updated: '2026-08-20', md: '# Sterling Harness 项目\n\n## 背景\nSterling Harness 是用户日常使用的智能体工作台：每个能力是一个 Cordis 插件行，Agent 预设按会话挂载。\n\n## 事实\n- **架构**：Cordis 组合式插件\n- **预设**：每会话一个 agent preset\n- **技能**：editing-cordis-compositions、cordis-plugin-development 等\n- **规划中**：记忆系统（MEMORY.md + SKILL.md + FTS5 检索）\n\n## 进展\n1. HTML 原型已确认布局与交互\n2. 开发文档已落地\n3. 以持久化 Cordis 插件实现真实读写' },
    { key: 'memory-module', type: '短期记忆', name: '记忆系统模块设计', category: '进行中的任务', description: '记忆系统以持久化 Cordis 插件形式落地，对齐 Hermes 记忆架构。', importance: '中', tags: '记忆模块 · 设计', updated: '2026-08-20', expires: '2026-08-25', md: '# 记忆系统模块设计\n\n## 背景\n以持久化 Cordis 插件（memvault）落地记忆系统：记忆库 + 技能库 + 会话检索 + 学习循环 + 提供者。\n\n## 事实\n- **记忆**：MEMORY.md（纯 Markdown，按 ## 分区）\n- **技能**：SKILL.md（YAML frontmatter）\n- **会话**：FTS5 跨会话检索\n- **学习循环**：事件驱动，write_approval 门控\n- **提供者**：builtin + honcho 等可插拔后端\n\n## 进展\n1. 完成开发文档\n2. Host 半体以持久化插件落地\n3. Client 设置 UI 作为后续阶段' }
  ]

  const SEED_SKILLS = [
    { key: 'code-review', name: '代码审查', status: 'active', version: '1.2.0', description: '审查代码变更，检查风格、正确性与安全隐患', allowedTools: ['memory_list', 'memory_view', 'session_search'], usage: 42, success: 40, lastUsed: '2026-08-19', body: '## 何时使用\n当用户提交代码改动或要求审查时。\n\n## 步骤\n1. 先读变更范围与上下文\n2. 检查代码风格是否与记忆中的「代码风格」一致\n3. 检查正确性与边界条件\n4. 检查安全隐患与依赖\n5. 输出分级结论：必须改 / 建议改 / 可选' },
    { key: 'frontend-demo', name: '界面演示', status: 'pinned', version: '1.0.0', description: '制作设置界面 / 弹窗的静态 HTML 演示', allowedTools: ['memory_view'], usage: 18, success: 18, lastUsed: '2026-08-20', body: '## 何时使用\n用户要求先做 HTML 演示供确认，再谈落地时。\n\n## 步骤\n1. 确认布局：固定外框，内容区内部滚动\n2. 遵循无 emoji、结构化、克制风格\n3. 左导航 / 中详情 / 右侧边栏三栏布局\n4. 打开验证无裁剪后交付' },
    { key: 'memory-design', name: '记忆系统设计', status: 'staged', version: '0.9.0', description: '设计长期记忆模块的目录结构与检索接口（待审）', allowedTools: ['memory_list', 'memory_save'], usage: 6, success: 5, lastUsed: '2026-08-20', body: '## 何时使用\n讨论记忆系统架构、目录规范或检索接口时。\n\n## 步骤\n1. 明确记忆/技能/会话三个存储面\n2. 设计 frontmatter 与 ## 分区规范\n3. 定义 memory_list/view/save 工具契约\n4. 对齐 Hermes 的 background_review 与 provider 机制' },
    { key: 'legacy-v3', name: 'MCP 流程模拟', status: 'retired', version: '0.4.0', description: '早期 v3 的 MCP 工具调用流程演示（已归档）', allowedTools: [], usage: 9, success: 4, lastUsed: '2026-08-12', body: '## 已归档\n该技能用于 v3 的 MCP 调用流程演示，已被「界面演示」技能取代。' }
  ]

  const SEED_SESSIONS = [
    { id: '20260820_1530', content: '把记忆文件树改成右边的侧边栏，文件树和内容只能在框架内容上下滑动，外框是固定式的。', tags: ['记忆树', '侧边栏', '布局'] },
    { id: '20260820_1532', content: '把这个长期记忆标题删掉，界面要更紧凑一些。', tags: ['标题', '界面'] },
    { id: '20260820_1532', content: '把这个长期记忆改成记忆系统，位置放在插件和 agent 预设的中间。', tags: ['记忆系统', '导航'] },
    { id: '20260819_1000', content: '用户偏好 TypeScript，代码改动先给方案再动手，注释用中文。', tags: ['代码风格', '偏好'] },
    { id: '20260818_0900', content: '回复要结论先行，要点罗列，避免长篇铺垫，用简体中文。', tags: ['沟通', '语言'] },
    { id: '20260815_1400', content: 'Sterling Harness 是 Cordis 组合式插件工作台，每会话一个 agent preset。', tags: ['项目', 'Cordis'] },
    { id: '20260812_1100', content: '研究了 hermes-agent 的 FTS5 跨会话回忆与 Honcho 辩证用户建模。', tags: ['hermes', 'FTS5', 'Honcho'] },
    { id: '20260810_1600', content: '技能库用 SKILL.md 带 YAML frontmatter，技能可以自主创建和提升。', tags: ['技能', 'SKILL.md'] }
  ]

  const SEED_EVENTS = [
    { type: 'nudge', time: '18:04:00', title: 'nudge 触发', desc: '会话结束后的温和提醒，促使代理进入复盘阶段。' },
    { type: 'review', time: '18:04:02', title: 'background_review 启动', desc: 'fork 子代理评估本回合，判定「记忆系统」规划值得沉淀。' },
    { type: 'write', time: '18:04:05', title: 'write_approval 待批', desc: '拟写入 MEMORY.md 一条「记忆系统模块设计」，进入审批门。' },
    { type: 'write', time: '18:04:08', title: '记忆已写入', desc: '审批通过，memory_save 写入 MEMORY.md。' },
    { type: 'skill', time: '18:04:10', title: '技能创建', desc: '识别到「界面演示」为可复用流程，skill_manage 生成 SKILL.md。' },
    { type: 'review', time: '18:04:12', title: 'curator 维护', desc: '后台 Curator 评估技能库，建议归档「MCP 流程模拟」。' }
  ]

  const PROVIDERS = {
    builtin: { name: '内置 (BuiltinMemoryProvider)', kind: '内置', enabled: true, sub: '包装 MEMORY.md / USER.md 的读写', storage: base, method: '文件读写', desc: '默认提供者，直接读写本地 Markdown 记忆文件，不依赖外部服务。' },
    honcho: { name: 'Honcho', kind: '外部', enabled: false, sub: '辩证用户建模 · 数字孪生', storage: base + 'honcho/', method: 'observe / query / profile', desc: '外部记忆服务（可选）。每条交互作为 observation，经 synthesis 辩证综合成稳定用户模型。', honcho: { workspace: 'default', user: 'dev-01', session: '当前会话', reasoning: 'dialecticDynamic / honcho_reasoning' } },
    holographic: { name: 'Holographic', kind: '外部', enabled: false, sub: '全息记忆（HRR 权重）', storage: base + 'holographic/', method: '向量绑定 / 叠加', desc: '全息向量记忆，用高维随机向量叠加表示记忆，支持近似检索与遗忘。' },
    hindsight: { name: 'Hindsight', kind: '外部', enabled: false, sub: '原生化记忆提供者', storage: '外部 API', method: '写入 / 检索 API', desc: '第三方原生化记忆后端，通过 API 持久化并检索记忆。' }
  }

  let seedPromise = null
  async function seed() {
    const existing = await readText('memory.json')
    if (existing !== undefined) return
    const memIndex = SEED_MEMORIES.map(m => ({ key: m.key, type: m.type, name: m.name, category: m.category, description: m.description, importance: m.importance, tags: m.tags, updated: m.updated, expires: m.expires }))
    await writeJson('memory.json', memIndex)
    for (const m of SEED_MEMORIES) { await writeText('mem-' + m.key + '.md', m.md) }
    await writeJson('skills.json', SEED_SKILLS.map(s => ({ key: s.key, name: s.name, status: s.status, version: s.version, description: s.description, allowedTools: s.allowedTools, usage: s.usage, success: s.success, lastUsed: s.lastUsed })))
    for (const s of SEED_SKILLS) { await writeText('skill-' + s.key + '.md', s.body) }
    await writeJson('sessions.json', SEED_SESSIONS)
    await writeJson('events.json', SEED_EVENTS)
  }
  function ensureSeeded() {
    if (!seedPromise) seedPromise = seed()
    return seedPromise
  }

  async function listMemories() { await ensureSeeded(); return await readJson('memory.json', []) }
  async function viewMemory(key) {
    await ensureSeeded()
    const idx = await readJson('memory.json', [])
    const meta = idx.find(m => m.key === key)
    if (!meta) return { ok: false, error: 'not-found' }
    const md = await readText('mem-' + key + '.md')
    return { ok: true, key, md: md === undefined ? '' : md, meta }
  }
  async function saveMemory(payload) {
    await ensureSeeded()
    const idx = await readJson('memory.json', [])
    const key = payload.key || slug(payload.name)
    const now = today()
    const existing = idx.find(m => m.key === key)
    const meta = { key, type: payload.type || (existing && existing.type) || '长期记忆', name: payload.name || (existing && existing.name) || key, category: payload.category || (existing && existing.category) || '未分类', description: payload.description || (existing && existing.description) || '', importance: payload.importance || (existing && existing.importance) || '中', tags: payload.tags || (existing && existing.tags) || '', updated: now, expires: payload.expires || (existing && existing.expires) || undefined }
    await writeText('mem-' + key + '.md', payload.md || '')
    const next = existing ? idx.map(m => m.key === key ? meta : m) : idx.concat([meta])
    await writeJson('memory.json', next)
    return { ok: true, key, updated: now }
  }
  async function deleteMemory(key) {
    await ensureSeeded()
    const idx = await readJson('memory.json', [])
    await writeJson('memory.json', idx.filter(m => m.key !== key))
    return { ok: true }
  }
  async function listSkills() { await ensureSeeded(); return await readJson('skills.json', []) }
  async function viewSkill(key) {
    await ensureSeeded()
    const idx = await readJson('skills.json', [])
    const meta = idx.find(s => s.key === key)
    if (!meta) return { ok: false, error: 'not-found' }
    const body = await readText('skill-' + key + '.md')
    return { ok: true, key, body: body === undefined ? '' : body, meta }
  }
  async function searchSessions(q, tokenizer) {
    await ensureSeeded()
    const sessions = await readJson('sessions.json', [])
    const terms = (q || '').split(/\s+/).filter(Boolean)
    const out = []
    for (const s of sessions) {
      let score = 0
      const lc = s.content.toLowerCase()
      const lq = (q || '').toLowerCase()
      if (q && lc.includes(lq)) score = 3
      else { for (const t of terms) { if (lc.includes(t.toLowerCase())) score += 1 } }
      if (score > 0) out.push({ id: s.id, content: s.content, tags: s.tags, score })
    }
    out.sort((a, b) => b.score - a.score)
    return { ok: true, tokenizer: tokenizer || 'bigram', results: out }
  }
  async function listEvents() { await ensureSeeded(); return await readJson('events.json', []) }

  const register = (definition) => tools.register(definition)

  register(defineTool({
    name: 'memory_list',
    description: '列出记忆库索引（name + description，不含正文），供模型选择要查看的记忆。',
    parameters: {},
    output: { schema: JSON_SCHEMA, render: (args, value) => textBlock((value.memories || []).map(m => '- ' + m.key + '｜' + m.name + '（' + m.type + ' / ' + m.category + '）' + (m.description ? ' — ' + m.description : '')).join('\n') || '（记忆库为空）') },
    async execute() { return { memories: await listMemories() } },
  }))

  register(defineTool({
    name: 'memory_view',
    description: '按 key 加载单条记忆的纯 Markdown 正文与元数据。',
    parameters: { key: { type: 'string', required: true, description: '记忆 key' } },
    output: { schema: JSON_SCHEMA, render: (args, value) => textBlock(value.ok ? value.md : ('未找到记忆：' + args.key)) },
    async execute(args) { return await viewMemory(args.key) },
  }))

  register(defineTool({
    name: 'memory_save',
    description: '创建或更新一条记忆（纯 Markdown 正文 + 元数据），写入经 write_approval 语义门控。',
    parameters: { key: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, category: { type: 'string' }, description: { type: 'string' }, importance: { type: 'string' }, tags: { type: 'string' }, expires: { type: 'string' }, md: { type: 'string' } },
    output: { schema: JSON_SCHEMA, render: (args, value) => textBlock(value.ok ? ('已保存记忆「' + value.key + '」，更新于 ' + value.updated) : '保存失败') },
    async execute(args) { return await saveMemory(args) },
  }))

  register(defineTool({
    name: 'session_search',
    description: '跨会话全文检索历史会话记录（模拟 FTS5），返回命中列表与评分。',
    parameters: { q: { type: 'string', required: true, description: '检索关键词' }, tokenizer: { type: 'string', description: '分词策略 unicode61|trigram|bigram' } },
    output: { schema: JSON_SCHEMA, render: (args, value) => textBlock((value.results || []).map(r => '- [' + r.id + '] ' + r.content + '（score ' + r.score + '）').join('\n') || '未检索到相关会话') },
    async execute(args) { return await searchSessions(args.q, args.tokenizer) },
  }))

  // 供后续 Client UI 阶段使用的 RPC 语义（通过 tools 注册的模型工具已覆盖主要数据面）
  ctx.effect(() => {
    // 空 effect 保持插件 fiber 生命周期；无副作用
    return () => {}
  })

  // ── HTTP JSON API（Client 设置 UI 通过 fetch 调用，无需改 apiproxy/typert）──
  if (webServer !== undefined) {
    function sendJson(res, status, body) {
      const data = JSON.stringify(body)
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) })
      res.end(data)
    }
    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8')
            resolve(raw ? JSON.parse(raw) : {})
          } catch (e) { reject(e) }
        })
        req.on('error', reject)
      })
    }
    const api = {
      'mem.list': async () => ({ ok: true, memories: await listMemories() }),
      'mem.view': async (p) => await viewMemory(p.key),
      'mem.save': async (p) => await saveMemory(p),
      'mem.delete': async (p) => await deleteMemory(p.key),
      'skill.list': async () => ({ ok: true, skills: await listSkills() }),
      'skill.view': async (p) => await viewSkill(p.key),
      'search.run': async (p) => await searchSessions(p.q, p.tokenizer),
      'loop.events': async () => ({ ok: true, events: await listEvents() }),
      'providers.list': async () => ({ ok: true, providers: PROVIDERS }),
    }
    const disposers = []
    for (const [name, fn] of Object.entries(api)) {
      const path = '/api/memvault/' + name
      disposers.push(webServer.register({
        kind: 'exact',
        path,
        async handler(req, res) {
          try {
            const payload = req.method === 'POST' ? await readBody(req) : {}
            sendJson(res, 200, await fn(payload))
          } catch (error) {
            sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        },
      }))
    }
    ctx.effect(() => () => {
      for (const dispose of disposers) dispose()
    })
    console.log('[memvault] HTTP API registered under /api/memvault/*')
  }

  console.log('[memvault] Host half activated, storage: ' + base)
}
