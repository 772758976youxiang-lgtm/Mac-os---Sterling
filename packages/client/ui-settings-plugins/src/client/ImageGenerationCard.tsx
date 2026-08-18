/** The local image-generation plugin's custom provider configuration. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import { IMAGE_API_PROTOCOLS } from './image-card-controller.ts'
import type { ImageSettingsFace } from './image-card-controller.ts'
import type {} from './slot-contract.ts'
import css from './VisionCard.module.css'

/** Props the renderer binds for the image-generation plugin card. */
export type ImageGenerationCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<ImageSettingsFace>

/** Render the custom provider used for image generation. */
export function ImageGenerationCard(props: ImageGenerationCardProps) {
  const { t } = props
  const state = props.useImageSettings(snapshot => snapshot)
  const disabled = !state.writable || state.saving
  return (
    <PluginCard
      t={t}
      titleKey="imageTitle"
      descriptionKey="imageDescription"
      state={state}
      onOpen={props.refresh}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <div className={css.fields}>
        <label className={css.field} htmlFor="plugin-config-image-provider">
          <span className={css.label}>{t('imageProvider')}</span>
          <input
            id="plugin-config-image-provider"
            className={css.input}
            type="text"
            value={state.provider}
            placeholder="acme-images"
            aria-label={t('imageProvider')}
            disabled={disabled}
            onChange={(event) => { props.edit('provider', event.currentTarget.value) }}
          />
        </label>
        <label className={css.field} htmlFor="plugin-config-image-display-name">
          <span className={css.label}>{t('imageDisplayName')}</span>
          <input
            id="plugin-config-image-display-name"
            className={css.input}
            type="text"
            value={state.displayName}
            placeholder={state.provider || t('imageDisplayName')}
            aria-label={t('imageDisplayName')}
            disabled={disabled}
            onChange={(event) => { props.edit('displayName', event.currentTarget.value) }}
          />
        </label>
        <label className={css.field} htmlFor="plugin-config-image-base-url">
          <span className={css.label}>{t('imageBaseUrl')}</span>
          <input
            id="plugin-config-image-base-url"
            className={css.input}
            type="url"
            value={state.baseURL}
            placeholder="https://gateway.example/v1"
            aria-label={t('imageBaseUrl')}
            disabled={disabled}
            onChange={(event) => { props.edit('baseURL', event.currentTarget.value) }}
          />
        </label>
        <label className={css.field} htmlFor="plugin-config-image-api">
          <span className={css.label}>{t('imageApi')}</span>
          <select
            id="plugin-config-image-api"
            className={`${css.input} ${css.selectInput}`}
            value={state.api}
            aria-label={t('imageApi')}
            disabled={disabled}
            onChange={(event) => { props.edit('api', event.currentTarget.value) }}
          >
            {IMAGE_API_PROTOCOLS.map(protocol => <option key={protocol} value={protocol}>{protocol}</option>)}
          </select>
        </label>
        <label className={css.field} htmlFor="plugin-config-image-model">
          <span className={css.label}>{t('imageModel')}</span>
          <input
            id="plugin-config-image-model"
            className={css.input}
            type="text"
            value={state.model}
            placeholder="gpt-image-2"
            aria-label={t('imageModel')}
            disabled={disabled}
            onChange={(event) => { props.edit('model', event.currentTarget.value) }}
          />
        </label>
        <div className={css.full}>
          <SecretField
            id="plugin-config-image-api-key"
            label={t('imageApiKey')}
            hint={t('imageApiKeyHint')}
            disabled={disabled || !state.apiKeyWritable}
            text={state.apiKeyDraft}
            configured={state.apiKeyConfigured}
            stateLabel={state.apiKeyConfigured ? t('imageConfigured') : t('imageNotConfigured')}
            onEdit={(text) => { props.edit('apiKey', text) }}
          />
        </div>
      </div>
      {state.invalid && state.dirty ? <p className={css.notice} role="status">{t('imageCustomRequired')}</p> : null}
      <p className={css.hint}>{t('imageHint')}</p>
    </PluginCard>
  )
}
