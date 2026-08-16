/** SMTP transport adapter for the email digest plugin. @module @deepseek-ai/dsh-email-digest */

import nodemailer from 'nodemailer'

/** Resolved SMTP settings used for one send operation. */
export interface SmtpSpec {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly username: string
  readonly password: string
  readonly from: string
  readonly recipients: readonly string[]
}

/** Rendered message accepted by the transport adapter. */
export interface DigestMail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/** Send one digest over a fresh SMTP connection. */
export async function sendSmtpDigest(spec: SmtpSpec, mail: DigestMail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: spec.host,
    port: spec.port,
    secure: spec.secure,
    auth: { user: spec.username, pass: spec.password },
  })
  try {
    await transport.sendMail({
      from: spec.from,
      to: [...spec.recipients],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
  } finally {
    transport.close()
  }
}
