export const performanceOpenAiJsonSchema = {
  name: 'performance_telemetry',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      advisors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            soCount: { type: 'integer' },
            hrsSold: { type: 'number' },
            laborSold: { type: 'number' },
            grossLabor: { type: 'number' },
            partsSold: { type: 'number' },
            grossParts: { type: 'number' },
            totalSales: { type: 'number' },
            gpPercent: { type: 'number' },
            elr: { type: 'number' },
            upsells: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  description: { type: 'string' },
                  count: { type: 'integer' },
                  revenue: { type: 'number' },
                },
                required: ['code', 'description', 'count', 'revenue'],
                additionalProperties: false,
              },
            },
          },
          required: [
            'name',
            'soCount',
            'hrsSold',
            'laborSold',
            'grossLabor',
            'partsSold',
            'grossParts',
            'totalSales',
            'gpPercent',
            'elr',
            'upsells',
          ],
          additionalProperties: false,
        },
      },
      totals: {
        type: 'object',
        properties: {
          totalSales: { type: 'number' },
          totalLabor: { type: 'number' },
          totalGross: { type: 'number' },
          totalParts: { type: 'number' },
          totalGrossParts: { type: 'number' },
          totalHrs: { type: 'number' },
        },
        required: [
          'totalSales',
          'totalLabor',
          'totalGross',
          'totalParts',
          'totalGrossParts',
          'totalHrs',
        ],
        additionalProperties: false,
      },
    },
    required: ['advisors', 'totals'],
    additionalProperties: false,
  },
} as const;

export const DEALERBUILT_PERFORMANCE_SYSTEM_PROMPT = `You are an expert DealerBuilt DMS report parser for the "Service Advisor Performance" productivity/gross report.

This report lists each service writer (RO Svc Wrtr) in their own section with pay-type rows (Customer Pay, Internal, Serv Contract, Warranty) and a TOTAL row per advisor.

For EACH service advisor / service writer section, extract from the TOTAL row (not pay-type sub-rows):
- name: Full advisor name from "RO Svc Wrtr <Name> <ID>" header (proper case, e.g. "Tom Healey")
- soCount: RO count from TOTAL row (column labeled ROs — NOT invoice count)
- hrsSold: Total Hours from TOTAL row
- laborSold: Labor Sales (1 Line Sales) from TOTAL row
- grossLabor: Labor Gross from TOTAL row
- partsSold: Parts Sales from TOTAL row
- grossParts: Parts Gross from TOTAL row
- totalSales: laborSold + partsSold
- gpPercent: (grossLabor / laborSold) * 100 when laborSold > 0, else 0
- elr: Effective Labor Rate from TOTAL row (Eff Labor Rate column)
- upsells: empty array [] unless this is an OP code frequency report

For department totals (Company Total / grand TOTAL section at end of report):
- totalLabor: sum Labor Sales across all advisors OR Company Total Labor Sales
- totalGross: Company Total Labor Gross
- totalParts: Company Total Parts Sales
- totalGrossParts: Company Total Parts Gross
- totalHrs: Company Total Hours
- totalSales: totalLabor + totalParts

CRITICAL RULES:
- ONLY extract real human service advisor names. NEVER use pay types, column headers, or categories as names.
- Do NOT invent advisors. Do NOT split one advisor into multiple rows.
- Do NOT distribute totals among Frank/Lemmy — use actual names from the report.
- Ignore voided/zero-dollar filters and header metadata.
- Numbers must match the printed report; preserve cents precision.
- If reading scanned images, read tables carefully column by column.`;
