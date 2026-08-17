/** Staged browser settings for the optional SMTP daily digest. */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CardForm, booleanField, numberField, textField,
  type CardActions, type CardFieldSpec, type CardFieldState, type CardShell,
} from './card-form.ts'

/** Settings projection namespace owned by the email-digest plugin. */
export const EMAIL_DIGEST_NS = 'email-digest'
const PASSWORD_FIELD = 'smtpPassword'

/** Flat settings projection served by the Host email-digest plugin. */
export interface EmailDigestSettings {
  enabled?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUsername?: string
  passwordRef?: string
  recipients?: string
  from?: string
}

interface CredentialState {
  ref: string
  configured: boolean
  writable: boolean
}

/** Fields edited as a comma-separated recipient list. */
function recipientsField(): CardFieldSpec {
  return {
    field: 'recipients',
    format: value => Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : '',
    parse: (text) => {
      const values = text.split(',').map(value => value.trim()).filter(Boolean)
      return values.length === 0 ? { kind: 'clear' } : { kind: 'set', value: values.join(', ') }
    },
  }
}

/** What the card renders. */
export interface EmailDigestCardState extends CardShell {
  enabled: CardFieldState
  smtpHost: CardFieldState
  smtpPort: CardFieldState
  smtpSecure: CardFieldState
  smtpUsername: CardFieldState
  passwordRef: CardFieldState
  recipients: CardFieldState
  from: CardFieldState
  smtpPassword: CardFieldState
  passwordConfigured: boolean
  passwordWritable: boolean
}

/** Registration-side face injected into the email digest card. */
export interface EmailDigestCardFace extends CardActions {
  hooks: { emailDigestCard: SnapshotStore<EmailDigestCardState> }
}

/** Bridges settings and credential domains onto the email digest card. */
export class EmailDigestCardController {
  private readonly form: CardForm<EmailDigestSettings>
  private readonly store: SnapshotStore<EmailDigestCardState>
  private credential: CredentialState = { ref: '', configured: false, writable: true }

  constructor(
    scope: SettingsScope<EmailDigestSettings>,
    private readonly api: Pick<IApiClient, 'credentials'>,
  ) {
    this.form = new CardForm(scope, [
      booleanField('enabled'),
      textField('smtpHost'), numberField('smtpPort'), booleanField('smtpSecure'),
      textField('smtpUsername'), textField('passwordRef'), recipientsField(),
      textField('from'),
    ], [{ field: PASSWORD_FIELD, write: text => this.writePassword(text) }])
    this.store = this.form.bind(() => this.projection())
    scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): EmailDigestCardState {
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      smtpHost: this.form.field('smtpHost'),
      smtpPort: this.form.field('smtpPort'),
      smtpSecure: this.form.field('smtpSecure'),
      smtpUsername: this.form.field('smtpUsername'),
      passwordRef: this.form.field('passwordRef'),
      recipients: this.form.field('recipients'),
      from: this.form.field('from'),
      smtpPassword: this.form.field(PASSWORD_FIELD),
      passwordConfigured: this.credential.configured,
      passwordWritable: this.credential.writable,
    }
  }

  private currentRef(): string {
    return this.form.field('passwordRef').text.trim()
  }

  private async readCredential(): Promise<void> {
    const ref = this.currentRef()
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    if (ref === '') return
    try {
      const response = await this.api.credentials.describe({ refs: [ref] })
      if (!response.result.ok || ref !== this.currentRef()) return
      const view = response.result.value.credentials[ref]
      this.credential = {
        ref,
        configured: view?.configured ?? false,
        writable: view?.writable ?? true,
      }
      this.store.set(this.projection())
    } catch {
      // Keep the form usable if credentials are temporarily unavailable.
    }
  }

  private async writePassword(value: string): Promise<boolean> {
    const ref = this.currentRef()
    if (ref === '') return false
    try {
      await this.api.credentials.set({ ref, value })
    } catch {
      // The follow-up read is authoritative for both refusal and success.
    }
    await this.readCredential()
    return this.credential.configured
  }

  inject(): EmailDigestCardFace {
    return { hooks: { emailDigestCard: this.store }, ...this.form.actions() }
  }
}
