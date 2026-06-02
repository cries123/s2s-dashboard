import type { Express, Request, Response } from 'express';
import type OpenAI from 'openai';
import { normalizeDmsProvider, parsePerformanceReport } from '../index.js';
import { isScannedOrEmptyReportText } from '../pdfToImages.js';
import { parseDealerBuiltPerformanceWithOpenAI } from '../parsers/dealerbuiltPerformanceOpenAI.js';
import {
  normalizeDealerBuiltPerformanceAdvisor,
  parseDealerBuiltPerformanceDeterministic,
} from '../parsers/dealerbuiltPerformance.js';
import { performanceOpenAiJsonSchema } from '../schemas/performanceOpenAiSchema.js';

type ExtractPdfText = (buffer: Buffer) => Promise<string>;
type GetOpenAI = () => OpenAI;

function hasUsableOpenAIKey(): boolean {
  const openaiKey = process.env.OPENAI_API_KEY;
  const isMaskedKey = !!(openaiKey && openaiKey.includes('*'));
  return !!(
    openaiKey &&
    openaiKey.trim() !== '' &&
    !openaiKey.includes('YOUR_') &&
    !isMaskedKey
  );
}

function validatePbsPerformance(
  parsed: any,
  text: string,
  parseDeterministicPerformance: (reportText: string) => any
) {
  const ref = parseDeterministicPerformance(text);

  if (parsed?.advisors?.length > 0) {
    const cleanName = (n: string) => {
      const name = n.toUpperCase().trim();
      if (name.includes('FRANK')) return 'Frank';
      if (name.includes('LEMMY')) return 'Lemmy';
      if (name.includes('JARYN')) return 'Jaryn';
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };

    parsed.advisors = parsed.advisors.map((a: any) => {
      const normName = cleanName(a.name);
      const lSold = a.laborSold !== undefined ? Number(a.laborSold) : 0;
      const pSold = a.partsSold !== undefined ? Number(a.partsSold) : 0;
      const gLab = a.grossLabor !== undefined ? Number(a.grossLabor) : 0;
      const hSold = a.hrsSold !== undefined ? Number(a.hrsSold) : 0;

      return {
        ...a,
        name: normName,
        soCount: a.soCount !== undefined ? Math.round(Number(a.soCount)) : 0,
        hrsSold: hSold,
        laborSold: lSold,
        grossLabor: gLab,
        partsSold: pSold,
        grossParts: a.grossParts !== undefined ? Number(a.grossParts) : 0,
        totalSales:
          a.totalSales !== undefined
            ? Number(a.totalSales)
            : Math.round((lSold + pSold) * 100) / 100,
        gpPercent:
          a.gpPercent !== undefined
            ? Number(a.gpPercent)
            : lSold > 0
              ? Math.round((gLab / lSold) * 1000) / 10
              : 0,
        elr:
          a.elr !== undefined
            ? Number(a.elr)
            : hSold > 0
              ? Math.round((lSold / hSold) * 100) / 100
              : 0,
        upsells: a.upsells || [],
      };
    });

    if (parsed.totals) {
      parsed.totals = {
        totalSales:
          Number(parsed.totals.totalSales) ||
          Number(parsed.totals.totalLabor || 0) +
            Number(parsed.totals.totalParts || 0),
        totalLabor: Number(parsed.totals.totalLabor) || 0,
        totalGross: Number(parsed.totals.totalGross) || 0,
        totalParts: Number(parsed.totals.totalParts) || 0,
        totalGrossParts: Number(parsed.totals.totalGrossParts) || 0,
        totalHrs: Number(parsed.totals.totalHrs) || 0,
      };
    } else if (ref.totals) {
      parsed.totals = ref.totals;
    }
  } else if (ref?.advisors?.length > 0) {
    return ref;
  }

  return parsed;
}

function validateDealerBuiltPerformance(parsed: any) {
  if (!parsed?.advisors?.length) return parsed;

  parsed.advisors = parsed.advisors
    .map((a: any) => normalizeDealerBuiltPerformanceAdvisor(a))
    .filter((a: any) => a.name.length > 1);

  if (parsed.totals) {
    parsed.totals = {
      totalSales:
        Number(parsed.totals.totalSales) ||
        Number(parsed.totals.totalLabor || 0) +
          Number(parsed.totals.totalParts || 0),
      totalLabor: Number(parsed.totals.totalLabor) || 0,
      totalGross: Number(parsed.totals.totalGross) || 0,
      totalParts: Number(parsed.totals.totalParts) || 0,
      totalGrossParts: Number(parsed.totals.totalGrossParts) || 0,
      totalHrs: Number(parsed.totals.totalHrs) || 0,
    };
  }

  return parsed;
}

export function registerParsePerformanceRoute(
  app: Express,
  deps: {
    extractTextFromPDFBuffer: ExtractPdfText;
    getOpenAIClient: GetOpenAI;
    getAIClient: () => any;
    performanceSchemaGemini: any;
  }
) {
  app.post('/api/parse-performance', async (req: Request, res: Response) => {
    const dmsProvider = normalizeDmsProvider(req.body?.dmsProvider);
    const parseDeterministicPerformance = (reportText: string) =>
      parsePerformanceReport(reportText, dmsProvider);

    try {
      const { pdfBase64, reportText } = req.body;
      let text = reportText || '';
      let pdfBuffer: Buffer | undefined;

      if (pdfBase64) {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
        if (!text) {
          text = await deps.extractTextFromPDFBuffer(pdfBuffer);
        }
      }

      const isDealerBuilt = dmsProvider === 'dealerbuilt';
      const isScannedPdf = isScannedOrEmptyReportText(text);

      if (!text && !pdfBuffer) {
        return res
          .status(400)
          .json({ error: 'No performance data or PDF detected.' });
      }

      if (isDealerBuilt && hasUsableOpenAIKey()) {
        try {
          console.log(
            `[DealerBuilt Performance] OpenAI parse (vision=${!!(pdfBuffer && (isScannedPdf || !text))})`
          );
          const openai = deps.getOpenAIClient();
          const aiResult = await parseDealerBuiltPerformanceWithOpenAI(openai, {
            reportText: text || undefined,
            pdfBuffer,
            useVision: !!(pdfBuffer && isScannedPdf),
          });

          if (aiResult?.advisors?.length) {
            return res.json({
              ...validateDealerBuiltPerformance(aiResult),
              isAiParsed: true,
              dmsProvider,
            });
          }
        } catch (err) {
          console.error('[DealerBuilt Performance] OpenAI error:', err);
        }
      }

      if (!text && pdfBuffer && isDealerBuilt) {
        return res.status(422).json({
          error:
            'Could not read this scanned DealerBuilt PDF. Ensure OPENAI_API_KEY is configured for vision parsing.',
        });
      }

      if (!text) {
        return res
          .status(400)
          .json({ error: 'No performance data or PDF detected.' });
      }

      const validateAndReconcileTotals = (parsed: any) =>
        isDealerBuilt
          ? validateDealerBuiltPerformance(parsed)
          : validatePbsPerformance(parsed, text, parseDeterministicPerformance);

      if (!isDealerBuilt && hasUsableOpenAIKey()) {
        try {
          console.log(
            '[OpenAI Performance Parser] Parsing report text using gpt-4o-mini...'
          );
          const openai = deps.getOpenAIClient();
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert automotive Service Advisor/CSR productivity and performance report parser. Extract metrics cleanly and with high precision.
For each service advisor cleanly identify:
- name: Clean name (e.g. Frank, Lemmy)
- soCount: Total physical repair orders or service orders completed
- hrsSold: Total flat rate or sold hours billed
- laborSold: Total labor sales revenue
- grossLabor: Total labor gross profit dollars
- partsSold: Total parts sales revenue
- grossParts: Total parts gross profit dollars
- totalSales: Combined total sales revenue (usually labor + parts)
- gpPercent: Blended gross profit percentage (0 to 100)
- elr: Effective labor rate (ELR)

Also overall mechanical department totals:
- totalSales: Total combined sales
- totalLabor: Total combined labor sales
- totalGross: Total combined labor gross profit dollars
- totalParts: Total combined parts sales
- totalGrossParts: Total combined parts gross profit dollars
- totalHrs: Total combined hours sold

CRITICAL GUIDELINE: If the report text does not list individual advisor-specific breakdowns, you MUST distribute the totals proportionally among the two standard active advisors: 'Frank' (56%) and 'Lemmy' (44%). Do NOT treat system category/price code labels as advisors.`,
              },
              {
                role: 'user',
                content: `Parse this automotive performance/productivity report chunk and return structured JSON:\n\n${text}`,
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: performanceOpenAiJsonSchema,
            },
            temperature: 0,
          });

          const resContent = completion.choices[0]?.message?.content;
          if (resContent) {
            const parsed = JSON.parse(resContent);
            return res.json(validateAndReconcileTotals(parsed));
          }
        } catch (err) {
          console.error('[OpenAI Performance Parser] Error:', err);
        }
      }

      const geminiKey = process.env.GEMINI_API_KEY;
      const isGeminiKeyMasked = !!(geminiKey && geminiKey.includes('*'));
      const hasGemini = !!(
        geminiKey &&
        geminiKey.trim() !== '' &&
        !geminiKey.includes('YOUR_') &&
        !isGeminiKeyMasked
      );

      if (!isDealerBuilt && hasGemini) {
        try {
          console.log(
            '[Gemini Performance Parser] Parsing using gemini-2.0-flash...'
          );
          const client = deps.getAIClient();
          const response = await client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Extract Service Advisor productivity metrics according to the required schema.`,
                  },
                  { text },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: deps.performanceSchemaGemini,
              temperature: 0,
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            return res.json(validateAndReconcileTotals(parsed));
          }
        } catch (err) {
          console.error('[Gemini Performance Parser] Error:', err);
        }
      }

      console.log(
        `[Performance Parser Fallback] DMS=${dmsProvider} deterministic parse`
      );
      const deterministicResult = isDealerBuilt
        ? parseDealerBuiltPerformanceDeterministic(text)
        : parseDeterministicPerformance(text);
      return res.json(deterministicResult);
    } catch (error: any) {
      console.error('API Error Performance:', error);
      res.status(500).json({
        error: `Internal Server Error during performance parse: ${error.message}`,
      });
    }
  });
}
