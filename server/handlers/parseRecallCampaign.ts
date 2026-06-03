import type { Express, Request, Response } from 'express';
import type OpenAI from 'openai';
import {
  dedupeRecallCampaignLeads,
  parseRecallCampaignReportText,
  type RecallCampaignLeadInput,
} from '../../src/lib/recallCampaignParser.ts';
import { hasUsableOpenAIKey, openAiFailureMessage } from '../dms/requireOpenAi.js';

type ExtractPdfText = (buffer: Buffer) => Promise<string>;
type GetOpenAI = () => OpenAI;

const recallLeadSchema = {
  type: 'object' as const,
  properties: {
    meta: {
      type: 'object' as const,
      properties: {
        campaignNumber: { type: 'string' },
        campaignDescription: { type: 'string' },
        reportGeneratedOn: { type: 'string' },
      },
      required: ['campaignNumber', 'campaignDescription', 'reportGeneratedOn'],
      additionalProperties: false,
    },
    leads: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          customerName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          vin: { type: 'string' },
          year: { type: 'string' },
          make: { type: 'string' },
          model: { type: 'string' },
          campaignNumber: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          zip: { type: 'string' },
        },
        required: [
          'customerName',
          'phone',
          'email',
          'vin',
          'year',
          'make',
          'model',
          'campaignNumber',
          'address',
          'city',
          'state',
          'zip',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['meta', 'leads'],
  additionalProperties: false,
};

function mergeAiWithDeterministic(
  deterministic: ReturnType<typeof parseRecallCampaignReportText>,
  aiLeads: RecallCampaignLeadInput[]
) {
  const aiByVin = new Map(aiLeads.map((l) => [l.vin.toUpperCase(), l]));
  const merged = deterministic.leads.map((lead) => {
    const ai = aiByVin.get(lead.vin.toUpperCase());
    if (!ai) return lead;
    return {
      ...lead,
      customerName: ai.customerName?.trim() || lead.customerName,
      phone: lead.phone || ai.phone,
      email: lead.email || ai.email,
      address: lead.address || ai.address,
      city: lead.city || ai.city,
      state: lead.state || ai.state,
      zip: lead.zip || ai.zip,
    };
  });

  const { leads, duplicateCount } = dedupeRecallCampaignLeads(merged);
  return {
    meta: {
      ...deterministic.meta,
      campaignDescription:
        aiLeads.length > 0
          ? deterministic.meta.campaignDescription
          : deterministic.meta.campaignDescription,
    },
    leads,
    duplicateCount: deterministic.duplicateCount + duplicateCount,
    parseMethod: 'hybrid' as const,
  };
}

async function parseWithOpenAI(
  openai: OpenAI,
  reportText: string
): Promise<RecallCampaignLeadInput[]> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You extract Hyundai/OEM recall campaign customer lists from dealer PDF text exports. ' +
          'Return one row per unique VIN. Include customerName, phone, email when present. ' +
          'Skip placeholder phones like 000-000-0000. Never duplicate the same VIN.',
      },
      {
        role: 'user',
        content: `Parse this recall campaign report:\n\n${reportText.slice(0, 120000)}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'recall_campaign_leads',
        strict: true,
        schema: recallLeadSchema,
      },
    },
    temperature: 0,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return [];
  const parsed = JSON.parse(content) as { leads: RecallCampaignLeadInput[] };
  return parsed.leads || [];
}

export function registerParseRecallCampaignRoute(
  app: Express,
  deps: { extractTextFromPDFBuffer: ExtractPdfText; getOpenAIClient: GetOpenAI }
) {
  app.post('/api/parse-recall-campaign', async (req: Request, res: Response) => {
    try {
      const { pdfBase64, reportText } = req.body ?? {};
      let text: string = reportText || '';

      if (!text && pdfBase64) {
        const buffer = Buffer.from(pdfBase64, 'base64');
        text = await deps.extractTextFromPDFBuffer(buffer);
      }

      if (!text?.trim()) {
        return res.status(400).json({ error: 'No recall report text or PDF detected.' });
      }

      const deterministic = parseRecallCampaignReportText(text);
      if (deterministic.leads.length === 0) {
        return res.status(422).json({
          error: 'No recall customers found in this PDF. Confirm it is a Recall Details export.',
        });
      }

      let result: {
        meta: typeof deterministic.meta;
        leads: RecallCampaignLeadInput[];
        duplicateCount: number;
        parseMethod: string;
      } = {
        ...deterministic,
        parseMethod: 'deterministic',
      };

      if (hasUsableOpenAIKey()) {
        try {
          const openai = deps.getOpenAIClient();
          const aiLeads = await parseWithOpenAI(openai, text);
          if (aiLeads.length > 0) {
            result = mergeAiWithDeterministic(deterministic, aiLeads);
          }
        } catch (err) {
          console.warn('[Recall Campaign Parser] OpenAI enrichment failed:', openAiFailureMessage(err));
        }
      }

      return res.json({
        ...result,
        leadCount: result.leads.length,
        withPhone: result.leads.filter((l) => l.phone).length,
        withEmail: result.leads.filter((l) => l.email).length,
      });
    } catch (error: unknown) {
      console.error('[Recall Campaign Parser] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: `Failed to parse recall campaign report: ${message}` });
    }
  });
}
