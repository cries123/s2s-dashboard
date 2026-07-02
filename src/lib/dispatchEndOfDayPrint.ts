export interface DispatchEodPrintRow {
  roNumber: string;
  customer: string;
  detail: string;
}

export interface DispatchEodPrintPayload {
  dealershipName: string;
  businessDate: string;
  generatedAt: string;
  metrics: { label: string; value: string }[];
  downInShopRows: DispatchEodPrintRow[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintHtml(payload: DispatchEodPrintPayload): string {
  const metricTiles = payload.metrics
    .map(
      (tile) => `
        <div class="metric">
          <div class="metric-label">${escapeHtml(tile.label)}</div>
          <div class="metric-value">${escapeHtml(tile.value)}</div>
        </div>
      `
    )
    .join('');

  const rowsHtml =
    payload.downInShopRows.length > 0
      ? payload.downInShopRows
          .map(
            (row, index) => `
          <tr class="${index % 2 === 0 ? 'row-even' : 'row-odd'}">
            <td class="ro">RO ${escapeHtml(row.roNumber)}</td>
            <td class="customer">${escapeHtml(row.customer)}</td>
            <td class="detail">${escapeHtml(row.detail)}</td>
          </tr>
        `
          )
          .join('')
      : '';

  const tableSection =
    payload.downInShopRows.length > 0
      ? `
        <table class="ro-table">
          <thead>
            <tr>
              <th>Repair order</th>
              <th>Customer</th>
              <th>Tech / promise</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <p class="footer-note">${payload.downInShopRows.length} vehicle${
          payload.downInShopRows.length === 1 ? '' : 's'
        } down in shop at close.</p>
      `
      : `<p class="empty">No vehicles down in shop at close.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dispatch EOD — ${escapeHtml(payload.dealershipName)}</title>
    <style>
      @page {
        size: letter portrait;
        margin: 0.45in;
      }

      html, body {
        margin: 0;
        padding: 0;
        height: auto;
        min-height: 0;
        background: #fff;
        color: #0f172a;
      }

      body {
        font-family: "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
        font-size: 11px;
        line-height: 1.35;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .report {
        width: 100%;
        max-width: 7.5in;
        margin: 0 auto;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 14px;
        margin-bottom: 16px;
        border-bottom: 2px solid #0f172a;
        page-break-inside: avoid;
        break-inside: avoid-page;
      }

      .badge {
        display: inline-block;
        margin-bottom: 6px;
        padding: 3px 8px;
        border-radius: 999px;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #475569;
      }

      h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.1;
        font-weight: 900;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .subtitle {
        margin: 4px 0 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
      }

      .meta {
        text-align: right;
        font-size: 10px;
        color: #475569;
        line-height: 1.5;
        white-space: nowrap;
      }

      .meta strong {
        display: block;
        color: #0f172a;
        font-size: 11px;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 18px;
        page-break-inside: avoid;
        break-inside: avoid-page;
      }

      .metric {
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: #f8fafc;
        padding: 10px 12px;
      }

      .metric-label {
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 4px;
      }

      .metric-value {
        font-size: 20px;
        font-weight: 900;
        line-height: 1;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }

      .section-title {
        margin: 0 0 8px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #334155;
      }

      .ro-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #cbd5e1;
        font-size: 10px;
      }

      .ro-table thead {
        display: table-header-group;
      }

      .ro-table th {
        background: #0f172a;
        color: #fff;
        text-align: left;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 8px 10px;
      }

      .ro-table td {
        padding: 7px 10px;
        border-bottom: 1px solid #e2e8f0;
        vertical-align: top;
      }

      .ro-table tr {
        page-break-inside: avoid;
        break-inside: avoid-page;
      }

      .row-even { background: #fff; }
      .row-odd { background: #f8fafc; }

      .ro {
        width: 18%;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .customer {
        width: 42%;
        font-weight: 700;
      }

      .detail {
        width: 40%;
        color: #475569;
      }

      .empty, .footer-note {
        margin: 0;
        font-size: 10px;
        color: #64748b;
      }

      .empty {
        padding: 20px;
        text-align: center;
        border: 1px dashed #cbd5e1;
        border-radius: 10px;
      }

      .footer-note {
        margin-top: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      @media print {
        html, body {
          width: auto;
          height: auto;
          overflow: visible;
        }

        .report {
          max-width: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="report">
      <header class="header">
        <div>
          <span class="badge">End of day</span>
          <h1>${escapeHtml(payload.dealershipName)}</h1>
          <p class="subtitle">Dispatch snapshot — down in shop</p>
        </div>
        <div class="meta">
          <strong>Business date ${escapeHtml(payload.businessDate)}</strong>
          Generated ${escapeHtml(payload.generatedAt)}
        </div>
      </header>

      <section class="metrics">${metricTiles}</section>

      <h2 class="section-title">Down in shop repair orders</h2>
      ${tableSection}
    </div>
  </body>
</html>`;
}

export function printDispatchEndOfDayReport(payload: DispatchEodPrintPayload): boolean {
  const printWindow = window.open('', '_blank', 'width=900,height=900,resizable=yes,scrollbars=yes');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(buildPrintHtml(payload));
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === 'complete') {
    window.setTimeout(triggerPrint, 400);
  } else {
    printWindow.addEventListener('load', () => window.setTimeout(triggerPrint, 400), { once: true });
  }

  return true;
}
