/** Email digest SMTP settings card. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginCard } from './PluginCard.tsx'
import { SecretField, ToggleField, ValueField } from './fields.tsx'
import type { EmailDigestCardFace } from './email-digest-card-controller.ts'
import type {} from './slot-contract.ts'

export type EmailDigestCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<EmailDigestCardFace>

type EditableField =
  | 'smtpHost' | 'smtpPort' | 'smtpUsername' | 'passwordRef' | 'recipients'
  | 'sendAt' | 'timeZone' | 'from' | 'subject' | 'retryMinutes'

/** Render editable SMTP, schedule and recipient settings for the digest. */
export function EmailDigestCard(props: EmailDigestCardProps) {
  const { t } = props
  const state = props.useEmailDigestCard(snapshot => snapshot)
  const disabled = !state.writable
  const value = (field: EditableField, id: string, label: string, hint: string, numeric = false) => (
    <ValueField
      id={id}
      label={label}
      hint={hint}
      overriddenLabel={t('overridden')}
      resetLabel={t('reset')}
      invalidLabel={t('invalidText')}
      disabled={disabled}
      numeric={numeric}
      {...state[field]}
      onEdit={(text) => { props.edit(field, text) }}
      onReset={() => { props.resetField(field) }}
    />
  )
  return (
    <PluginCard
      t={t}
      titleKey="emailDigestTitle"
      descriptionKey="emailDigestDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <ToggleField
        id="plugin-config-email-enabled"
        label={t('emailDigestEnabled')}
        hint={t('emailDigestEnabledHint')}
        checked={state.enabled.text === 'true'}
        disabled={disabled}
        onEdit={(text) => { props.edit('enabled', text) }}
      />
      {value('smtpHost', 'plugin-config-email-host', t('emailDigestHost'), t('emailDigestHostHint'))}
      {value('smtpPort', 'plugin-config-email-port', t('emailDigestPort'), t('emailDigestPortHint'), true)}
      <ToggleField
        id="plugin-config-email-secure"
        label={t('emailDigestSecure')}
        hint={t('emailDigestSecureHint')}
        checked={state.smtpSecure.text === 'true'}
        disabled={disabled}
        onEdit={(text) => { props.edit('smtpSecure', text) }}
      />
      {value('smtpUsername', 'plugin-config-email-username', t('emailDigestUsername'), t('emailDigestUsernameHint'))}
      {value('passwordRef', 'plugin-config-email-password-ref', t('emailDigestPasswordRef'), t('emailDigestPasswordRefHint'))}
      <SecretField
        id="plugin-config-email-password"
        label={t('emailDigestPassword')}
        hint={t('emailDigestPasswordHint')}
        text={state.smtpPassword.text}
        configured={state.passwordConfigured}
        stateLabel={state.passwordConfigured ? t('emailDigestPasswordSet') : t('emailDigestPasswordUnset')}
        disabled={!state.passwordWritable}
        onEdit={(text) => { props.edit('smtpPassword', text) }}
      />
      {value('recipients', 'plugin-config-email-recipients', t('emailDigestRecipients'), t('emailDigestRecipientsHint'))}
      {value('sendAt', 'plugin-config-email-send-at', t('emailDigestSendAt'), t('emailDigestSendAtHint'))}
      {value('timeZone', 'plugin-config-email-time-zone', t('emailDigestTimeZone'), t('emailDigestTimeZoneHint'))}
      {value('from', 'plugin-config-email-from', t('emailDigestFrom'), t('emailDigestFromHint'))}
      {value('subject', 'plugin-config-email-subject', t('emailDigestSubject'), t('emailDigestSubjectHint'))}
      {value('retryMinutes', 'plugin-config-email-retry', t('emailDigestRetry'), t('emailDigestRetryHint'), true)}
    </PluginCard>
  )
}
