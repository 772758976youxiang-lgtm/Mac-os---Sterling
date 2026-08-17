/** The local image-understanding plugin's configured model selection. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import { VISION_API_PROTOCOLS } from './vision-card-controller.ts'
import type { VisionSettingsFace } from './vision-card-controller.ts'
import type {} from './slot-contract.ts'
import css from './VisionCard.module.css'

/** Props the renderer binds for the vision plugin card. */
export type VisionCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<VisionSettingsFace>

/** Render the custom provider used for image understanding. */
export function VisionCard(props: VisionCardProps) {
  const { t } = props
  const state = props.useVisionSettings(snapshot => snapshot)
  const disabled = !state.writable || state.saving
  return (
    <PluginCard
      t={t}
      titleKey="visionTitle"
      descriptionKey="visionDescription"
      state={state}
      onOpen={props.refresh}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <div className={css.fields}>
        <label className={css.field} htmlFor="plugin-config-vision-provider">
          <span className={css.label}>{t('visionProvider')}</span>
          <input
            id="plugin-config-vision-provider"
            className={css.input}
            type="text"
            value={state.provider}
            placeholder="acme-gateway"
            aria-label={t('visionProvider')}
            disabled={disabled}
            onChange={(event) => { props.edit('provider', event.currentTarget.value) }}
          />
        </label>
        <label className={css.field} htmlFor="plugin-config-vision-display-name">
          <span className={css.label}>{t('visionDisplayName')}</span>
          <input
            id="plugin-config-vision-display-name"
            className={css.input}
            type="text"
            value={state.displayName}
            placeholder={state.provider || t('visionDisplayName')}
            aria-label={t('visionDisplayName')}
            disabled={disabled}
            onChange={(event) => { props.edit('displayName', event.currentTarget.value) }}
          />
        </label>
        <label className={css.field} htmlFor="plugin-config-vision-base-url">
          <span className={css.label}>{t('visionBaseUrl')}</span>
          <input
            id="plugin-config-vision-base-url"
            className={css.input}
            type="url"
            value={state.baseURL}
            placeholder="https://gateway.example/v1"
            aria-label={t('visionBaseUrl')}
            disabled={disabled}
            onChange={(event) => { props.edit('baseURL', event.currentTarget.value) }}
          />
        </label>
        <label className={css.field} htmlFor="plugin-config-vision-api">
          <span className={css.label}>{t('visionApi')}</span>
          <select
            id="plugin-config-vision-api"
            className={`${css.input} ${css.selectInput}`}
            value={state.api}
            aria-label={t('visionApi')}
            disabled={disabled}
            onChange={(event) => { props.edit('api', event.currentTarget.value) }}
          >
            {VISION_API_PROTOCOLS.map(protocol => <option key={protocol} value={protocol}>{protocol}</option>)}
          </select>
        </label>
        <label className={css.field} htmlFor="plugin-config-vision-model">
          <span className={css.label}>{t('visionModel')}</span>
          <input
            id="plugin-config-vision-model"
            className={css.input}
            type="text"
            value={state.model}
            placeholder="vision-model"
            aria-label={t('visionModel')}
            disabled={disabled}
            onChange={(event) => { props.edit('model', event.currentTarget.value) }}
          />
        </label>
        <div className={css.full}>
          <SecretField
            id="plugin-config-vision-api-key"
            label={t('visionApiKey')}
            hint={t('visionApiKeyHint')}
            disabled={disabled || !state.apiKeyWritable}
            text={state.apiKeyDraft}
            configured={state.apiKeyConfigured}
            stateLabel={state.apiKeyConfigured ? t('visionConfigured') : t('visionNotConfigured')}
            onEdit={(text) => { props.edit('apiKey', text) }}
          />
        </div>
      </div>
      {state.invalid && state.dirty ? <p className={css.notice} role="status">{t('visionCustomRequired')}</p> : null}
      <p className={css.hint}>{t('visionCustomHint')}</p>
    </PluginCard>
  )
}
