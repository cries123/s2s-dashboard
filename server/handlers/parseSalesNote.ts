import type { Express, Request, Response } from 'express';
import type OpenAI from 'openai';
import {
  hasUsableOpenAIKey,
  openAiFailureMessage,
  openAiFailureStatus,
  rejectIfOpenAiUnavailable,
} from '../dms/requireOpenAi.js';

type GetOpenAI = () => OpenAI;

const SALES_NOTE_PROMPT = `Extract fields from this handwritten sales note into a JSON object:
- firstName, lastName, phone, email, make (default "Hyundai"), model, vinLast8 (last 8), soldDate (YYYY-MM-DD), language.
JSON only.`;

export function registerParseSalesNoteRoute(app: Express, deps: { getOpenAIClient: GetOpenAI }) {
  app.post('/api/parse-sales-note', async (req: Request, res: Response) => {
    try {
      const imageBase64 = req.body?.imageBase64;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'imageBase64 is required.' });
      }

      const dataUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      if (!hasUsableOpenAIKey()) {
        if (rejectIfOpenAiUnavailable(res)) return;
        return;
      }

      const openai = deps.getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SALES_NOTE_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return res.status(502).json({ error: 'OpenAI returned an empty response.' });
      }

      const parsed = JSON.parse(content);
      return res.json(parsed);
    } catch (err: unknown) {
      console.error('[parse-sales-note]', err);
      return res.status(openAiFailureStatus(err)).json({ error: openAiFailureMessage(err) });
    }
  });
}
