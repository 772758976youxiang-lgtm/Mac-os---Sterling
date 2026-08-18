/** Read-only MCP server and capability catalog within Plugins settings. */

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type { McpInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './McpManagementSettingsTab.module.css'

/** Registration-side Remote face used by the MCP management tab. */
export interface McpManagementSettingsTabInjected {
  /** Read the configured MCP servers and their currently discovered tools. */
  list: () => Promise<McpInventorySnapshot>
}

type McpServer = McpInventorySnapshot['servers'][number]

/** Full component props assembled by the Settings slot renderer. */
export type McpManagementSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<McpManagementSettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: McpInventorySnapshot }

/** Localize the meaningful lifecycle facts for an MCP server. */
function statusLabel(server: McpServer, t: McpManagementSettingsTabProps['t']): string {
  if (!server.enabled) return t('disabledTag')
  if (server.fiberPhase === 'active') return t('mcpConnected')
  if (server.fiberPhase === 'failed') return t('mcpFailed')
  if (server.fiberPhase === 'loading' || server.fiberPhase === 'pending') return t('mcpConnecting')
  return t('mcpUnavailable')
}

/** Whether a server or its discovered capabilities match the local query. */
function matches(server: McpServer, query: string): boolean {
  if (query.length === 0) return true
  return [server.serverName, server.transport ?? '', ...server.tools.flatMap(tool => [tool.name, tool.description])]
    .some(value => value.toLocaleLowerCase().includes(query))
}

/** Render the discovered MCP capability catalog without exposing connection secrets. */
export function McpManagementSettingsTab({
  list,
  t,
}: McpManagementSettingsTabProps): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const servers = useMemo(
    () => state.status === 'ready' ? state.snapshot.servers.filter(server => matches(server, normalizedQuery)) : [],
    [normalizedQuery, state],
  )
  const toolCount = state.status === 'ready'
    ? state.snapshot.servers.reduce((count, server) => count + server.tools.length, 0)
    : 0

  useEffect(() => {
    if (expanded !== null && !servers.some(server => server.entryId === expanded)) setExpanded(null)
  }, [expanded, servers])

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status}>{t('mcpLoading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('mcpError')}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('mcpSearch')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('mcpSearch')}
              aria-label={t('mcpSearch')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
          <div className={css.catalogHeading}>
            <h3>{t('mcpCatalog')}</h3>
            <span>{t('mcpSummary', { servers: state.snapshot.servers.length, tools: toolCount })}</span>
            <button type="button" className={css.refresh} onClick={retry}>{t('refresh')}</button>
          </div>
          {state.snapshot.servers.length === 0 ? <p className={css.status}>{t('mcpEmpty')}</p> : null}
          {state.snapshot.servers.length > 0 && servers.length === 0 ? <p className={css.status}>{t('mcpEmptySearch')}</p> : null}
          {servers.length > 0 ? (
            <ul className={css.cards}>
              {servers.map((server) => {
                const open = expanded === server.entryId
                const detailsId = `${catalogId}-details-${encodeURIComponent(server.entryId)}`
                const status = statusLabel(server, t)
                return (
                  <li className={css.card} key={server.entryId} data-open={open ? 'true' : undefined}>
                    <button
                      type="button"
                      className={css.cardContent}
                      aria-expanded={open}
                      aria-controls={detailsId}
                      aria-label={`${server.serverName}, ${status}, ${t('mcpToolCount', { count: server.tools.length })}`}
                      onClick={() => { setExpanded(current => current === server.entryId ? null : server.entryId) }}
                    >
                      <span className={css.serverIdentity}>
                        <strong>{server.serverName}</strong>
                        <span>{server.transport === 'streamable-http' ? t('mcpHttp') : server.transport === 'local' ? t('mcpLocal') : t('mcpStdio')}</span>
                      </span>
                      <span className={css.trailing}>
                        <span className={css.statusDot} data-status={server.enabled ? server.fiberPhase ?? 'unavailable' : 'disabled'} aria-label={status} role="img" />
                        <span className={css.count}>{server.tools.length}</span>
                        <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                      </span>
                    </button>
                    {open ? (
                      <div className={css.details} id={detailsId}>
                        {server.tools.length === 0 ? <p className={css.status}>{t('mcpNoTools')}</p> : (
                          <ul className={css.tools} aria-label={t('mcpTools')}>
                            {server.tools.map(tool => (
                              <li key={tool.name}>
                                <code>{tool.name}</code>
                                {tool.description.length > 0 ? <p>{tool.description}</p> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
