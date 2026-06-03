import type { Express, Request, Response } from 'express';
import { normalizeRecallEmail, normalizeRecallPhone } from '../../src/lib/recallCampaignParser.ts';

interface OutreachRecipient {
  id: string;
  customerName?: string;
  phone?: string | null;
  email?: string | null;
  year?: string;
  make?: string;
  model?: string;
  campaignNumber?: string;
}

function twilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

function sendGridConfigured(): boolean {
  return !!(process.env.SENDGRID_API_KEY && process.env.OUTREACH_FROM_EMAIL);
}

async function sendSms(to: string, body: string): Promise<{ ok: true; sid?: string } | { ok: false; error: string }> {
  if (!twilioConfigured()) {
    return { ok: false, error: 'SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in server environment variables.' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const normalized = normalizeRecallPhone(to);
  if (!normalized) {
    return { ok: false, error: 'Invalid phone number.' };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: normalized,
        From: from,
        Body: body,
      }),
    }
  );

  const data = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) {
    return { ok: false, error: data.message || `Twilio error (${response.status})` };
  }
  return { ok: true, sid: data.sid };
}

async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sendGridConfigured()) {
    return {
      ok: false,
      error: 'Email is not configured. Set SENDGRID_API_KEY and OUTREACH_FROM_EMAIL in server environment variables.',
    };
  }

  const email = normalizeRecallEmail(to);
  if (!email) {
    return { ok: false, error: 'Invalid email address.' };
  }

  const fromEmail = process.env.OUTREACH_FROM_EMAIL!;
  const fromName = process.env.OUTREACH_FROM_NAME || 'Hyundai Service';

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { ok: false, error: errText.slice(0, 200) || `SendGrid error (${response.status})` };
  }
  return { ok: true };
}

function personalizeMessage(template: string, recipient: OutreachRecipient): string {
  const name = recipient.customerName?.trim() || 'Hyundai Owner';
  return template
    .replace(/\{name\}/gi, name)
    .replace(/\{customer\}/gi, name)
    .replace(/\{year\}/gi, recipient.year || '')
    .replace(/\{make\}/gi, recipient.make || '')
    .replace(/\{model\}/gi, recipient.model || '')
    .replace(/\{campaign\}/gi, recipient.campaignNumber || '');
}

export function registerOutreachRoutes(app: Express) {
  app.get('/api/outreach/status', (_req: Request, res: Response) => {
    res.json({
      smsConfigured: twilioConfigured(),
      emailConfigured: sendGridConfigured(),
    });
  });

  app.post('/api/outreach/bulk', async (req: Request, res: Response) => {
    try {
      const {
        channel,
        message,
        subject,
        recipients,
      }: {
        channel: 'sms' | 'email';
        message: string;
        subject?: string;
        recipients: OutreachRecipient[];
      } = req.body ?? {};

      if (!channel || !message?.trim()) {
        return res.status(400).json({ error: 'channel and message are required.' });
      }
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Select at least one recipient.' });
      }
      if (recipients.length > 200) {
        return res.status(400).json({ error: 'Maximum 200 recipients per bulk send.' });
      }

      const results: Array<{
        id: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const recipient of recipients) {
        const body = personalizeMessage(message, recipient);
        if (channel === 'sms') {
          if (!recipient.phone) {
            results.push({ id: recipient.id, success: false, error: 'No phone on file' });
            continue;
          }
          const result = await sendSms(recipient.phone, body);
          results.push({
            id: recipient.id,
            success: result.ok,
            error: result.ok ? undefined : (result as { ok: false; error: string }).error,
          });
        } else {
          if (!recipient.email) {
            results.push({ id: recipient.id, success: false, error: 'No email on file' });
            continue;
          }
          const result = await sendEmail(
            recipient.email,
            subject?.trim() || 'Important Vehicle Recall Notice',
            body
          );
          results.push({
            id: recipient.id,
            success: result.ok,
            error: result.ok ? undefined : (result as { ok: false; error: string }).error,
          });
        }
      }

      const sent = results.filter((r) => r.success).length;
      const failed = results.length - sent;
      return res.json({ sent, failed, results });
    } catch (error: unknown) {
      console.error('[Outreach Bulk] Error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  });
}
