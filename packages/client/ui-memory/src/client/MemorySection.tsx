/** Memory-system settings page: vault, skills, session search, learning loop, providers. */

import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemoryKey } from './locales.ts'
import { createApi, type LoopEvent, type MemoryDoc, type MemoryMeta, type ProviderView, type SearchHit, type SkillDoc, type SkillMeta } from './store.ts'
import css from './MemorySection.module.css'

type Translate = (key: MemoryKey) => string

/** Registration-side dependencies for the settings section. */
export interface MemorySectionInjected {
  api: ReturnType<typeof createApi>
  t: Translate
}

/** Props bound by the settings slot outlet. */
export type MemorySectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<MemorySectionInjected>

type TabId = 'vault' | 'skills' | 'search' | 'loop' | 'providers'

const TABS: { id: TabId; label: MemoryKey; tag: MemoryKey }[] = [
  { id: 'vault', label: 'vault', tag: 'vaultTag' },
  { id: 'skills', label: 'skills', tag: 'skillsTag' },
  { id: 'search', label: 'search', tag: 'searchTag' },
  { id: 'loop', label: 'loop', tag: 'loopTag' },
  { id: 'providers', label: 'providers', tag: 'providersTag' },
]

const STATUS_LABEL: Record<string, MemoryKey> = {
  active: 'active', pinned: 'pinned', staged: 'staged', retired: 'retired',
}

/** Escape HTML for the md renderer and search highlight. */
function esc(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Inline markdown: bold / italic / code. */
function inline(value: string): string {
  return esc(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

/** Minimal markdown → HTML renderer (headings, lists, code blocks, paragraphs). */
export function mdToHtml(src: string | undefined): string {
  if (!src) return ''
  const lines = src.split('\n')
  let html = ''
  let inCode = false
  const codeBuf: string[] = []
  let inUl = false
  let inOl = false
  const close = () => {
    if (inUl) { html += '</ul>'; inUl = false }
    if (inOl) { html += '</ol>'; inOl = false }
  }
  for (const raw of lines) {
    const t = raw.trim()
    if (t.startsWith('```')) {
      if (!inCode) { close(); inCode = true; codeBuf.length = 0 }
      else {
        html += '<pre style="background:#1e2430;color:#d6dbe6;border-radius:7px;padding:10px 12px;overflow-x:auto;font-size:11px">' + esc(codeBuf.join('\n')) + '</pre>'
        inCode = false
      }
      continue
    }
    if (inCode) { codeBuf.push(raw); continue }
    if (!t || t.startsWith('---')) { close(); continue }
    const h = t.match(/^(#{1,6})\s+(.*)$/)
    if (h !== null && h[1] !== undefined && h[2] !== undefined) {
      close()
      const lv = h[1].length
      const txt = h[2].replace(/^\*\*(.+?)\*\*$/, '$1')
      if (lv === 1) html += '<h1>' + inline(txt) + '</h1>'
      else if (lv === 2) html += '<h2>' + inline(txt) + '</h2>'
      else html += '<p><strong>' + inline(txt) + '</strong></p>'
      continue
    }
    if (/^[-*]\s+/.test(t)) {
      if (inOl) { html += '</ol>'; inOl = false }
      if (!inUl) { html += '<ul>'; inUl = true }
      html += '<li>' + inline(t.replace(/^[-*]\s+/, '')) + '</li>'
      continue
    }
    if (/^\d+\.\s+/.test(t)) {
      if (inUl) { html += '</ul>'; inUl = false }
      if (!inOl) { html += '<ol>'; inOl = true }
      html += '<li>' + inline(t.replace(/^\d+\.\s+/, '')) + '</li>'
      continue
    }
    close()
    html += '<p>' + inline(t) + '</p>'
  }
  close()
  return html
}

/** ── Tab: 记忆库（vault）── */
function Vault({ api, t }: { api: ReturnType<typeof createApi>; t: Translate }) {
  const [memories, setMemories] = useState<MemoryMeta[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [doc, setDoc] = useState<MemoryDoc | null>(null)
  const [editing, setEditing] = useState(false)
  const [edText, setEdText] = useState('')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRoots, setOpenRoots] = useState<Record<string, boolean>>({ '长期记忆': true, '短期记忆': true })

  useEffect(() => {
    api.listMemories().then(r => setMemories(r.memories)).catch(e => setError(String(e)))
  }, [api])

  const open = (key: string) => {
    setSelected(key)
    setEditing(false)
    api.viewMemory(key).then(r => setDoc(r)).catch(e => setError(String(e)))
  }

  const save = () => {
    if (selected === null) return
    api.saveMemory({ key: selected, md: edText }).then(() => {
      setEditing(false)
      open(selected)
    }).catch(e => setError(String(e)))
  }

  const remove = () => {
    if (selected === null) return
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 2600); return }
    api.deleteMemory(selected).then(() => {
      setSelected(null)
      setDoc(null)
      setConfirming(false)
      api.listMemories().then(r => setMemories(r.memories)).catch(e => setError(String(e)))
    }).catch(e => setError(String(e)))
  }

  const visible = useMemo(() => {
    if (memories === null) return null
    if (!query) return memories
    const q = query.toLowerCase()
    return memories.filter(m => (m.name + ' ' + m.category + ' ' + m.description).toLowerCase().includes(q))
  }, [memories, query])

  const roots = useMemo(() => {
    const map: Record<string, Record<string, MemoryMeta[]>> = {}
    for (const m of visible ?? []) {
      const type = m.type || '长期记忆'
      const byType = map[type] ?? (map[type] = {})
      const list = byType[m.category] ?? (byType[m.category] = [])
      list.push(m)
    }
    return map
  }, [visible])

  const chipType = doc?.meta.type === '长期记忆' ? 'lt' : 'st'

  return (
    <>
      <p className={css.desc} dangerouslySetInnerHTML={{ __html: inline(t('vaultDesc')) }} />
      <div className={css.workspace}>
        <div className={`${css.pane} ${css.detailPane}`}>
          <div className={css.paneHead}>
            <span>{selected !== null && doc ? `${doc.meta.type} / ${doc.meta.category} / ${doc.meta.name}` : t('selectHint')}</span>
            {selected !== null && (
              <span className={css.headActions}>
                <button type="button" className={`${css.button} ${css.sm}`} onClick={() => { setEditing(!editing); if (doc) setEdText(doc.md) }}>
                  {editing ? t('cancel') : t('edit')}
                </button>
                <button type="button" className={`${css.button} ${css.sm} ${css.danger}`} onClick={remove}>
                  {confirming ? t('confirmDelete') : t('delete')}
                </button>
              </span>
            )}
          </div>
          <div className={css.paneBody}>
            {error !== null && (
              <div className={css.errorState}><strong>{t('loadError')}</strong><span>{error}</span></div>
            )}
            {error === null && doc !== null && !editing && (
              <>
                <div className={css.chipRow}>
                  <span className={`${css.chip} ${chipType}`}>{doc.meta.type}</span>
                  <span className={css.chip}><b>{t('importance')}</b> {doc.meta.importance}</span>
                  {doc.meta.tags && <span className={css.chip}><b>{t('tags')}</b> {doc.meta.tags}</span>}
                  <span className={css.chip}><b>{t('updated')}</b> {doc.meta.updated}</span>
                  {doc.meta.expires && <span className={`${css.chip} ${css.danger}`}><b>{t('expires')}</b> {doc.meta.expires}</span>}
                </div>
                <div className={css.mdView} dangerouslySetInnerHTML={{ __html: mdToHtml(doc.md) }} />
              </>
            )}
            {error === null && doc !== null && editing && (
              <div className={css.editor}>
                <textarea spellCheck={false} value={edText} onChange={e => setEdText(e.target.value)} />
                <div className={css.editorOps}>
                  <button type="button" className={css.button} onClick={() => setEditing(false)}>{t('cancel')}</button>
                  <button type="button" className={`${css.button} ${css.primary}`} onClick={save}>{t('save')}</button>
                </div>
              </div>
            )}
            {error === null && doc === null && <div className={css.empty}>{t('emptyVault')}</div>}
          </div>
        </div>

        <div className={`${css.pane} ${css.vaultPane}`}>
          <div className={css.paneHead}>
            <span>{t('vault')}</span>
            <span className={css.hint}>{memories === null ? '' : `${memories.length} ${t('count')}`}</span>
          </div>
          <div className={css.searchField}>
            <input placeholder={t('searchMemory')} value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className={`${css.paneBody} ${css.treeBody}`}>
            {visible === null && <div className={css.status}>{t('loading')}</div>}
            {visible !== null && Object.keys(roots).length === 0 && <div className={css.empty}>{t('emptyVault')}</div>}
            {visible !== null && Object.keys(roots).map((type) => {
              const isOpen = openRoots[type] ?? true
              return (
                <div key={type}>
                  <div
                    className={css.treeRow}
                    onClick={() => setOpenRoots({ ...openRoots, [type]: !isOpen })}
                  >
                    <span className={css.arrow} data-open={isOpen}>▸</span>
                    <span className={css.mark}>◆</span>
                    <span className={css.nm}>{type}</span>
                  </div>
                  {isOpen && Object.keys(roots[type] ?? {}).map(category => (
                    <div key={category} style={{ paddingLeft: 14 }}>
                      <div className={css.treeRow}>
                        <span className={css.arrow}></span>
                        <span className={css.mark}>▣</span>
                        <span className={css.nm}>{category}</span>
                      </div>
                      {(roots[type]?.[category] ?? []).map(m => (
                        <div
                          key={m.key}
                          className={css.treeRow}
                          data-selected={selected === m.key}
                          style={{ paddingLeft: 28 }}
                          onClick={() => open(m.key)}
                        >
                          <span className={css.mark}>·</span>
                          <span className={css.nm}>{m.name}</span>
                          {m.expires && <span className={css.ex}>{m.expires.slice(5)}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

/** ── Tab: 技能库（skills）── */
function Skills({ api, t }: { api: ReturnType<typeof createApi>; t: Translate }) {
  const [skills, setSkills] = useState<SkillMeta[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [doc, setDoc] = useState<SkillDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listSkills().then((r) => {
      setSkills(r.skills)
      if (r.skills[0]) setSel(r.skills[0].key)
    }).catch(e => setError(String(e)))
  }, [api])

  useEffect(() => {
    if (sel !== null) api.viewSkill(sel).then(r => setDoc(r)).catch(e => setError(String(e)))
  }, [api, sel])

  return (
    <>
      <p className={css.desc} dangerouslySetInnerHTML={{ __html: inline(t('skillsDesc')) }} />
      <div className={css.workspace}>
        <div className={`${css.pane} ${css.skillsPane}`}>
          <div className={css.paneHead}>
            <span>{t('skills')}</span>
            <span className={css.hint}>{skills === null ? '' : `${skills.length} ${t('skillCount')}`}</span>
          </div>
          <div className={css.paneBody}>
            {error !== null && <div className={css.errorState}><strong>{t('loadError')}</strong><span>{error}</span></div>}
            {error === null && skills === null && <div className={css.status}>{t('loading')}</div>}
            {error === null && (skills ?? []).map(s => (
              <div key={s.key} className={css.row} data-selected={sel === s.key} onClick={() => setSel(s.key)}>
                <div className={css.rowMain}>
                  <div className={css.rowTitle}>
                    {s.name}
                    <span className={`${css.badge} ${s.status}`}>{t(STATUS_LABEL[s.status] ?? 'active')}</span>
                  </div>
                  <div className={css.rowSub}>{s.description}</div>
                  <div className={css.rowMeta}>
                    <span>v{s.version}</span>
                    <span>{s.usage}</span>
                    <span>{s.usage > 0 ? Math.round(s.success / s.usage * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`${css.pane}`} style={{ flex: 1 }}>
          <div className={css.paneHead}><span>{t('skills')}</span><span className={css.hint}>SKILL.md</span></div>
          <div className={css.paneBody}>
            {doc === null && <div className={css.status}>{t('loading')}</div>}
            {doc !== null && (
              <>
                <div className={css.kvGrid}>
                  <div className={css.kvRow}><span className={css.kvKey}>{t('skillName')}</span><span className={css.kvValue}>{doc.meta.name}</span></div>
                  <div className={css.kvRow}><span className={css.kvKey}>{t('skillVersion')}</span><span className={css.kvValue}>{doc.meta.version}</span></div>
                  <div className={css.kvRow}><span className={css.kvKey}>{t('skillDescription')}</span><span className={css.kvValue}>{doc.meta.description}</span></div>
                  <div className={css.kvRow}><span className={css.kvKey}>{t('skillTools')}</span><span className={css.kvValue}>{(doc.meta.allowedTools ?? []).join(', ') || '—'}</span></div>
                </div>
                <div className={css.mdView} dangerouslySetInnerHTML={{ __html: mdToHtml(doc.body) }} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/** ── Tab: 会话检索（search）── */
function Search({ api, t }: { api: ReturnType<typeof createApi>; t: Translate }) {
  const [query, setQuery] = useState('')
  const [tokenizer, setTokenizer] = useState('bigram')
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (q: string, tok: string) => {
    api.search(q, tok).then(r => setResults(r.results)).catch(e => setError(String(e)))
  }

  const notes: Record<string, string> = {
    unicode61: 'unicode61：默认分词器，按空格/标点切词，对连续中文不切分 —— 中文查询可能匹配不到（Issue #54242）。',
    trigram: 'trigram 回退：对超短词元降级为三字序列匹配，弥补 unicode61 对 CJK 的缺陷（PR #54258）。',
    bigram: 'CJK bigram 索引：中文按二元组建索引，取代 trigram + LIKE 路由（PR #65544）。',
  }

  const highlight = (text: string): string => {
    let out = esc(text)
    for (const term of query.split(/\s+/).filter(Boolean)) {
      out = out.split(esc(term)).join(`<mark>${esc(term)}</mark>`)
    }
    return out
  }

  return (
    <>
      <p className={css.desc} dangerouslySetInnerHTML={{ __html: inline(t('searchDesc')) }} />
      <div className={css.body}>
        <div className={css.searchBar}>
          <input placeholder={t('searchPlaceholder')} value={query} onChange={(e) => { setQuery(e.target.value); run(e.target.value, tokenizer) }} />
          <select value={tokenizer} onChange={(e) => { setTokenizer(e.target.value); run(query, e.target.value) }}>
            <option value="unicode61">unicode61</option>
            <option value="trigram">trigram</option>
            <option value="bigram">bigram</option>
          </select>
        </div>
        <div className={css.note}>{notes[tokenizer]}</div>
        <div className={css.resultList}>
          {error !== null && <div className={css.errorState}><strong>{t('loadError')}</strong><span>{error}</span></div>}
          {error === null && results === null && <div className={css.empty}>{t('searchEmpty')}</div>}
          {error === null && results !== null && results.length === 0 && <div className={css.empty}>{t('searchEmpty')}</div>}
          {error === null && (results ?? []).map(r => (
            <div key={r.id} className={css.resultItem}>
              <div className={css.resultHead}>
                <span style={{ fontFamily: 'var(--dsw-font-family-mono, monospace)' }}>{r.id}</span>
                <span>{(r.tags ?? []).map(tag => `#${tag}`).join(' ')}</span>
                <span className={css.score}>score {r.score}</span>
              </div>
              <div className={css.resultBody} dangerouslySetInnerHTML={{ __html: highlight(r.content) }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/** ── Tab: 学习循环（loop）── */
function Loop({ api, t }: { api: ReturnType<typeof createApi>; t: Translate }) {
  const [events, setEvents] = useState<LoopEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listEvents().then(r => setEvents(r.events)).catch(e => setError(String(e)))
  }, [api])

  const steps: { title: MemoryKey; sub: string }[] = [
    { title: 'flowTurn', sub: 'final_response' },
    { title: 'flowReview', sub: 'fork' },
    { title: 'flowWrite', sub: 'memory_save' },
    { title: 'flowSkill', sub: 'skill_manage' },
    { title: 'flowApproval', sub: 'gate' },
    { title: 'flowCurator', sub: 'background' },
  ]

  return (
    <>
      <p className={css.desc} dangerouslySetInnerHTML={{ __html: inline(t('loopDesc')) }} />
      <div className={css.body}>
        <div className={css.flowRow}>
          {steps.map((s, i) => (
            <span key={s.title} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <span className={css.flowStep}><span className={css.t}>{t(s.title)}</span><span className={css.s}>{s.sub}</span></span>
              {i < steps.length - 1 && <span className={css.flowArrow}>→</span>}
            </span>
          ))}
        </div>
        <div className={css.note}>{t('loopNote')}</div>
        <div className={`${css.pane}`} style={{ flex: 1 }}>
          <div className={css.paneHead}><span>{t('loop')}</span><span className={css.hint}>background_review / write_approval / curator</span></div>
          <div className={css.timeline}>
            {error !== null && <div className={css.errorState}><strong>{t('loadError')}</strong><span>{error}</span></div>}
            {error === null && events === null && <div className={css.status}>{t('loading')}</div>}
            {error === null && (events ?? []).map(e => (
              <div key={e.time + e.title} className={css.tlItem} data-type={e.type}>
                <span className={css.tlDot}></span>
                <span>
                  <div className={css.tlTime}>{e.time}</div>
                  <div className={css.tlTitle}>{e.title}</div>
                  <div className={css.tlDesc} dangerouslySetInnerHTML={{ __html: esc(e.desc).replace(/`(.+?)`/g, '<code>$1</code>') }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/** ── Tab: 记忆提供者（providers）── */
function Providers({ api, t }: { api: ReturnType<typeof createApi>; t: Translate }) {
  const [providers, setProviders] = useState<Record<string, ProviderView> | null>(null)
  const [sel, setSel] = useState<string>('builtin')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listProviders().then(r => setProviders(r.providers)).catch(e => setError(String(e)))
  }, [api])

  const provider = providers?.[sel]

  return (
    <>
      <p className={css.desc} dangerouslySetInnerHTML={{ __html: inline(t('providersDesc')) }} />
      <div className={css.workspace}>
        <div className={`${css.pane} ${css.providersPane}`}>
          <div className={css.paneHead}>
            <span>{t('providers')}</span>
            <span className={css.hint}>{providers === null ? '' : `${Object.keys(providers).length}`}</span>
          </div>
          <div className={css.paneBody}>
            {error !== null && <div className={css.errorState}><strong>{t('loadError')}</strong><span>{error}</span></div>}
            {error === null && providers === null && <div className={css.status}>{t('loading')}</div>}
            {error === null && providers !== null && Object.keys(providers).map((k) => {
              const item = providers[k]
              if (item === undefined) return null
              return (
                <div key={k} className={css.row} data-selected={sel === k} onClick={() => setSel(k)}>
                  <div className={css.rowMain}>
                    <div className={css.rowTitle}>{item.name}</div>
                    <div className={css.rowSub}>{item.sub}</div>
                  </div>
                  <span className={`${css.badge} ${item.enabled ? 'active' : 'retired'}`}>
                    {item.enabled ? '✓' : '·'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className={`${css.pane}`} style={{ flex: 1 }}>
          <div className={css.paneHead}><span>{t('providers')}</span><span className={css.hint}>{provider?.kind ?? ''}</span></div>
          <div className={css.paneBody} style={{ padding: '14px 16px' }}>
            {provider === undefined && <div className={css.status}>{t('loading')}</div>}
            {provider !== undefined && (
              <>
                <div className={css.kvRow}>
                  <span className={css.kvKey}>{t('providerStorage')}</span>
                  <span className={css.kvValue}><code>{provider.storage}</code></span>
                </div>
                <div className={css.kvRow}>
                  <span className={css.kvKey}>{t('providerApi')}</span>
                  <span className={css.kvValue}>{provider.method}</span>
                </div>
                <div className={css.kvRow}>
                  <span className={css.kvKey}>{t('providerDesc')}</span>
                  <span className={css.kvValue}>{provider.desc}</span>
                </div>
                {provider.honcho !== undefined && (
                  <div style={{
                    marginTop: 12,
                    padding: '10px 13px',
                    border: '1px solid var(--dsw-alias-border-l2)',
                    borderRadius: 8,
                    background: 'var(--dsw-alias-interactive-bg-hover)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--dsw-alias-label-secondary)' }}>
                      Honcho 用户建模映射（辩证）
                    </div>
                    <div className={css.kvRow}>
                      <span className={css.kvKey}>workspace</span>
                      <span className={css.kvValue}><code>{provider.honcho.workspace}</code></span>
                    </div>
                    <div className={css.kvRow}>
                      <span className={css.kvKey}>user</span>
                      <span className={css.kvValue}><code>{provider.honcho.user}</code></span>
                    </div>
                    <div className={css.kvRow}>
                      <span className={css.kvKey}>session</span>
                      <span className={css.kvValue}><code>{provider.honcho.session}</code></span>
                    </div>
                    <div className={css.kvRow}>
                      <span className={css.kvKey}>reasoning</span>
                      <span className={css.kvValue}><code>{provider.honcho.reasoning}</code></span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/** Memory-system settings page root. */
export function MemorySection(props: Partial<MemorySectionProps>) {
  const { api, t } = props
  const [tab, setTab] = useState<TabId>('vault')
  if (api === undefined || t === undefined) return null

  return (
    <section className={css.section}>
      <div className={css.headingRow}>
        <div>
          <h2>{t('title')}</h2>
          <p>{t('intro')}</p>
        </div>
      </div>
      <div className={css.tabs} role="tablist">
        {TABS.map(tabDef => (
          <button
            key={tabDef.id}
            type="button"
            role="tab"
            className={css.tab}
            data-active={tab === tabDef.id}
            onClick={() => setTab(tabDef.id)}
          >
            {t(tabDef.label)}
            <span className={css.tabTag}>{t(tabDef.tag)}</span>
          </button>
        ))}
      </div>
      <div className={css.body}>
        {tab === 'vault' && <Vault api={api} t={t} />}
        {tab === 'skills' && <Skills api={api} t={t} />}
        {tab === 'search' && <Search api={api} t={t} />}
        {tab === 'loop' && <Loop api={api} t={t} />}
        {tab === 'providers' && <Providers api={api} t={t} />}
      </div>
    </section>
  )
}
