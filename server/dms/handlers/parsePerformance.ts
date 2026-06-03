
async function withRouteTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const PARSE_ROUTE_TIMEOUT_MS = 4 * 60 * 1000;

import type { Express, Request, Response } from 'express';
import type OpenAI from 'openai';
import { normalizeDmsProvider, parsePerformanceReport } from '../index.js';
import { defaultDmsProviderForDealership } from '../../../src/constants/dealerDefaults.js';
import { isScannedOrEmptyReportText, looksLikeDealerBuiltPerformanceReport } from '../pdfToImages.js';
import { enrichReportTextFromPdf } from '../pdfOcr.js';
import { parseDealerBuiltPerformanceWithOpenAI } from '../parsers/dealerbuiltPerformanceOpenAI.js';
import {
  finalizeDealerBuiltPerformance,
  mergeDealerBuiltPerformanceResults,
  parseDealerBuiltPerformanceDeterministic,
} from '../parsers/dealerbuiltPerformance.js';
import { performanceOpenAiJsonSchema } from '../schemas/performanceOpenAiSchema.js';
import {
  hasUsableOpenAIKey,
  openAiFailureMessage,
  openAiFailureStatus,
  OPENAI_REQUIRED_MESSAGE,
  rejectIfOpenAiUnavailable,
} from '../requireOpenAi.js';
import { extractOperationsPayTypes } from '../../../src/lib/operationsPayTypes.ts';

function withPayTypes(payload: Record<string, unknown>, reportText: string) {
  const payTypes = extractOperationsPayTypes(reportText);
  return payTypes ? { ...payload, payTypes } : payload;
}


function isPhantomPbsAdvisorName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return n === 'frank' || n === 'lemmy' || n === 'jaryn' || n === 'jay';
}

type ExtractPdfText = (buffer: Buffer) => Promise<string>;
type GetOpenAI = () => OpenAI;

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
  }

  return parsed;
}

function validateDealerBuiltPerformance(parsed: any) {
  if (!parsed?.advisors?.length) return parsed;
  const finalized = finalizeDealerBuiltPerformance(parsed);
  if (finalized.totals) {
    finalized.totals = {
      totalSales:
        Number(finalized.totals.totalSales) ||
        Number(finalized.totals.totalLabor || 0) +
          Number(finalized.totals.totalParts || 0),
      totalLabor: Number(finalized.totals.totalLabor) || 0,
      totalGross: Number(finalized.totals.totalGross) || 0,
      totalParts: Number(finalized.totals.totalParts) || 0,
      totalGrossParts: Number(finalized.totals.totalGrossParts) || 0,
      totalHrs: Number(finalized.totals.totalHrs) || 0,
    };
  }
  return finalized;
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
    const dealershipId =
      typeof req.body?.dealershipId === 'string' ? req.body.dealershipId : undefined;
    const dmsProvider = req.body?.dmsProvider
      ? normalizeDmsProvider(req.body.dmsProvider)
      : dealershipId
        ? defaultDmsProviderForDealership(dealershipId)
        : normalizeDmsProvider(undefined);
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
        text = await enrichReportTextFromPdf(pdfBuffer, text);
      }

      const isScannedPdf = isScannedOrEmptyReportText(text);
      const isDealerBuiltReport =
        dmsProvider === 'dealerbuilt' ||
        looksLikeDealerBuiltPerformanceReport(text) ||
        (!!pdfBuffer && isScannedPdf);

      if (!text && !pdfBuffer) {
        return res
          .status(400)
          .json({ error: 'No performance data or PDF detected.' });
      }

      if (isDealerBuiltReport) {
        const deterministic = text
          ? parseDealerBuiltPerformanceDeterministic(text)
          : { advisors: [], totals: null as any };

        if (!hasUsableOpenAIKey()) {
          if (deterministic.advisors.length > 0) {
            return res.json(
              withPayTypes(
                { ...validateDealerBuiltPerformance(deterministic), isAiParsed: false, parseMethod: 'deterministic', dmsProvider: 'dealerbuilt' },
                text
              )
            );
          }
          if (rejectIfOpenAiUnavailable(res)) return;
        }

        try {
          const openai = deps.getOpenAIClient();
          const useVision = !!(pdfBuffer && isScannedPdf);
          console.log(
            `[DealerBuilt Performance] OpenAI required (deterministic=${deterministic.advisors.length}, vision=${useVision})`
          );

          const aiResult = await withRouteTimeout(
            parseDealerBuiltPerformanceWithOpenAI(openai, {
              reportText: text || undefined,
              pdfBuffer: useVision ? pdfBuffer : undefined,
              useVision,
            }),
            PARSE_ROUTE_TIMEOUT_MS,
            'DealerBuilt PDF parse'
          );

          if (!aiResult?.advisors?.length) {
            return res.status(502).json({
              error:
                'OpenAI could not extract advisors from this DealerBuilt report. Check the PDF and try again.',
              requiresOpenAi: true,
            });
          }

          let merged = mergeDealerBuiltPerformanceResults(deterministic, aiResult);

          const phantomOnly =
            merged.advisors.length > 0 &&
            merged.advisors.every((a) => isPhantomPbsAdvisorName(a.name));

          if (phantomOnly && deterministic.advisors.length > 0) {
            console.warn(
              '[DealerBuilt Performance] Ignoring phantom PBS advisor names; using deterministic OCR parse.'
            );
            merged = {
              advisors: deterministic.advisors,
              totals: deterministic.totals ?? merged.totals,
            };
          } else if (phantomOnly) {
            return res.status(502).json({
              error:
                'Parser returned legacy PBS demo names (Frank/Lemmy) instead of Ford service writers. Restart with `npm run dev`, confirm OPENAI_API_KEY is set, and set Admin → DMS → DealerBuilt.',
              requiresOpenAi: true,
            });
          }

          if (merged.advisors.length === 0) {
            return res.status(502).json({
              error: 'OpenAI parse completed but no valid advisors were found after validation.',
              requiresOpenAi: true,
            });
          }

          return res.json(withPayTypes({ ...validateDealerBuiltPerformance(merged), isAiParsed: true, dmsProvider: 'dealerbuilt' }, text));
        } catch (err: unknown) {
          console.error('[DealerBuilt Performance] OpenAI error, trying deterministic fallback:', err);
          if (deterministic.advisors.length > 0) {
            return res.json(
              withPayTypes(
                {
                  ...validateDealerBuiltPerformance(deterministic),
                  isAiParsed: false,
                  parseMethod: 'deterministic',
                  dmsProvider: 'dealerbuilt',
                },
                text
              )
            );
          }
          return res.status(openAiFailureStatus(err)).json({
            error: `Could not parse DealerBuilt report. ${openAiFailureMessage(err)}`,
            requiresOpenAi: true,
          });
        }
      }

      if (!text) {
        return res
          .status(400)
          .json({ error: 'No performance data or PDF detected.' });
      }

      if (hasUsableOpenAIKey()) {
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
- name: Clean name from the report (never invent names)
- soCount, hrsSold, laborSold, grossLabor, partsSold, grossParts, totalSales, gpPercent, elr

Also overall department totals: totalSales, totalLabor, totalGross, totalParts, totalGrossParts, totalHrs

Do NOT treat pay types, price codes, or table headers as advisor names.`,
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
        if (!resContent) {
          return res.status(502).json({
            error: 'OpenAI returned an empty performance parse response.',
            requiresOpenAi: true,
          });
        }

        const parsed = JSON.parse(resContent);
        if (!parsed?.advisors?.length) {
          return res.status(502).json({
            error: 'OpenAI could not identify any advisors in this report.',
            requiresOpenAi: true,
          });
        }

        return res.json(withPayTypes({ ...validatePbsPerformance(parsed, text, parseDeterministicPerformance), isAiParsed: true, dmsProvider }, text));
      } catch (err: unknown) {
        console.error('[OpenAI Performance Parser] Error, falling back to deterministic PBS parser:', err);
      }
      }

      const deterministic = parseDeterministicPerformance(text);
      if (deterministic?.advisors?.length || deterministic?.totals) {
        return res.json(
          withPayTypes(
            {
              ...validatePbsPerformance(deterministic, text, parseDeterministicPerformance),
              isAiParsed: false,
              parseMethod: 'deterministic',
              dmsProvider,
            },
            text
          )
        );
      }

      if (!hasUsableOpenAIKey()) {
        return res.status(422).json({ error: OPENAI_REQUIRED_MESSAGE, requiresOpenAi: true });
      }

      return res.status(502).json({
        error: 'Could not parse this PBS productivity report. Check the PDF and try again.',
        requiresOpenAi: true,
      });
    } catch (error: any) {
      console.error('API Error Performance:', error);
      res.status(500).json({
        error: `Internal Server Error during performance parse: ${error.message}`,
      });
    }
  });
}

// re-export for tests
export { hasUsableOpenAIKey, OPENAI_REQUIRED_MESSAGE };
