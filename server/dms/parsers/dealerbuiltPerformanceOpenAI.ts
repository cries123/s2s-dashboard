import type OpenAI from 'openai';
import type { PerformanceParseResult } from '../types';
import {
  DEALERBUILT_PERFORMANCE_SYSTEM_PROMPT,
  performanceOpenAiJsonSchema,
} from '../schemas/performanceOpenAiSchema';
import { pdfBufferToPngBase64Pages } from '../pdfToImages';
import {
  normalizeDealerBuiltPerformanceAdvisor,
  parseDealerBuiltPerformanceDeterministic,
} from './dealerbuiltPerformance';

function normalizeParsedResult(raw: PerformanceParseResult): PerformanceParseResult {
  const advisors = (raw.advisors || [])
    .map((a) => normalizeDealerBuiltPerformanceAdvisor(a))
    .filter((a) => a.name.length > 1);

  const totals = raw.totals || {
    totalSales: 0,
    totalLabor: 0,
    totalGross: 0,
    totalParts: 0,
    totalGrossParts: 0,
    totalHrs: 0,
  };

  return {
    advisors,
    totals: {
      totalSales:
        Number(totals.totalSales) ||
        Number(totals.totalLabor) + Number(totals.totalParts),
      totalLabor: Number(totals.totalLabor) || 0,
      totalGross: Number(totals.totalGross) || 0,
      totalParts: Number(totals.totalParts) || 0,
      totalGrossParts: Number(totals.totalGrossParts) || 0,
      totalHrs: Number(totals.totalHrs) || 0,
    },
  };
}

export async function parseDealerBuiltPerformanceWithOpenAI(
  openai: OpenAI,
  options: {
    reportText?: string;
    pdfBuffer?: Buffer;
    useVision?: boolean;
  }
): Promise<PerformanceParseResult | null> {
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

  if (options.reportText?.trim()) {
    userContent.push({
      type: 'text',
      text: `Parse this DealerBuilt Service Advisor Performance report:\n\n${options.reportText}`,
    });
  }

  const shouldUseVision =
    options.useVision !== false &&
    options.pdfBuffer &&
    options.pdfBuffer.length > 0;

  if (shouldUseVision && options.pdfBuffer) {
    const images = await pdfBufferToPngBase64Pages(options.pdfBuffer);
    for (const imageBase64 of images) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${imageBase64}`,
          detail: 'high',
        },
      });
    }
    if (!options.reportText?.trim()) {
      userContent.unshift({
        type: 'text',
        text: 'These images are scanned pages from a DealerBuilt Service Advisor Performance gross/productivity report. Extract every service advisor and department totals.',
      });
    }
  }

  if (userContent.length === 0) return null;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: DEALERBUILT_PERFORMANCE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: performanceOpenAiJsonSchema,
    },
    temperature: 0,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content) as PerformanceParseResult;
  const normalized = normalizeParsedResult(parsed);

  if (normalized.advisors.length === 0 && options.reportText?.trim()) {
    const fallback = parseDealerBuiltPerformanceDeterministic(options.reportText);
    if (fallback.advisors.length > 0) return fallback;
  }

  return normalized.advisors.length > 0 ? normalized : null;
}
