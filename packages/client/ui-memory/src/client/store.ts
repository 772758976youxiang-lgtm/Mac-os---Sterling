/** Memory-system page data over the host memvault HTTP API. */

/** One memory index entry. */
export interface MemoryMeta {
  key: string
  type: string
  name: string
  category: string
  description: string
  importance: string
  tags?: string
  updated: string
  expires?: string
}

/** One memory document (index + body). */
export interface MemoryDoc {
  ok: boolean
  key: string
  md: string
  meta: MemoryMeta
}

/** One skill index entry. */
export interface SkillMeta {
  key: string
  name: string
  status: string
  version: string
  description: string
  allowedTools?: string[]
  usage: number
  success: number
  lastUsed: string
}

/** One skill document. */
export interface SkillDoc {
  ok: boolean
  key: string
  body: string
  meta: SkillMeta
}

/** One session search hit. */
export interface SearchHit {
  id: string
  content: string
  tags?: string[]
  score: number
}

/** One learning-loop event. */
export interface LoopEvent {
  type: 'nudge' | 'review' | 'write' | 'skill'
  time: string
  title: string
  desc: string
}

/** One provider entry. */
export interface ProviderView {
  name: string
  kind: string
  enabled: boolean
  sub: string
  storage: string
  method: string
  desc: string
  honcho?: { workspace: string; user: string; session: string; reasoning: string }
}

/** Thin wrapper over the memvault HTTP JSON API. */
export class MemvaultApi {
  private readonly base = '/api/memvault/'

  private async post<T>(name: string, payload: unknown): Promise<T> {
    const response = await fetch(this.base + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
    if (!response.ok) throw new Error(`memvault ${name}: HTTP ${response.status}`)
    return await response.json() as T
  }

  listMemories(): Promise<{ ok: boolean; memories: MemoryMeta[] }> {
    return this.post('mem.list', {})
  }

  viewMemory(key: string): Promise<MemoryDoc> {
    return this.post('mem.view', { key })
  }

  saveMemory(payload: Record<string, unknown>): Promise<{ ok: boolean; key: string; updated: string }> {
    return this.post('mem.save', payload)
  }

  deleteMemory(key: string): Promise<{ ok: boolean }> {
    return this.post('mem.delete', { key })
  }

  listSkills(): Promise<{ ok: boolean; skills: SkillMeta[] }> {
    return this.post('skill.list', {})
  }

  viewSkill(key: string): Promise<SkillDoc> {
    return this.post('skill.view', { key })
  }

  search(q: string, tokenizer: string): Promise<{ ok: boolean; tokenizer: string; results: SearchHit[] }> {
    return this.post('search.run', { q, tokenizer })
  }

  listEvents(): Promise<{ ok: boolean; events: LoopEvent[] }> {
    return this.post('loop.events', {})
  }

  listProviders(): Promise<{ ok: boolean; providers: Record<string, ProviderView> }> {
    return this.post('providers.list', {})
  }
}

/** Shared API instance created once per settings section. */
export function createApi(): MemvaultApi {
  return new MemvaultApi()
}
