/** The local image-understanding plugin's API and credential configuration. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginCard } from './PluginCard.tsx'
import { SecretField } from './fields.tsx'
import type { VisionSettingsFace } from './vision-card-controller.ts'
import type {} from './slot-contract.ts'
import css from './VisionCard.module.css'

/** Props the renderer binds for the vision plugin card. */
export type VisionCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<VisionSettingsFace>

/** Render the independently configured image-understanding plugin. */
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
      onSave={props.save}
      onDiscard={props.discard}
    >
      <div className={css.fields}>
        <label className={css.field} htmlFor="plugin-config-vision-api-key-ref">
          <span className={css.label}>{t('visionApiKeyRef')}</span>
          <input
            id="plugin-config-vision-api-key-ref"
            className={css.input}
            type="text"
            value={state.apiKeyRef}
            disabled={disabled}
            onChange={(event) => { props.edit('apiKeyRef', event.currentTarget.value) }}
          />
        </label>
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
      <div className={css.meta}>
        <span>{t('visionModel')}: {state.model}</span>
        <span>{t('visionBaseUrl')}: {state.baseURL}</span>
      </div>
    </PluginCard>
  )
}
