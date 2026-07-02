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

export function printDispatchEndOfDayReport(payload: DispatchEodPrintPayload): boolean {
  const printWindow = window.open('', '_blank', 'width=800,height=900,resizable=yes,scrollbars=yes');
  if (!printWindow) return false;

  const metricTiles = payload.metrics
    .map(
      (tile) => `
        <div class="metric">
          <p class="metric-label">${escapeHtml(tile.label)}</p>
          <p class="metric-value">${escapeHtml(tile.value)}</p>
        </div>
      `
    )
    .join('');

  const rowsHtml =
    payload.downInShopRows.length > 0
      ? `
        <table>
          <thead>
            <tr>
              <th>Repair order</th>
              <th>Customer</th>
              <th>Tech / promise</th>
            </tr>
          </thead>
          <tbody>
            ${payload.downInShopRows
              .map(
                (row) => `
              <tr>
                <td>${escapeHtml(row.roNumber)}</td>
                <td>${escapeHtml(row.customer)}</td>
                <td>${escapeHtml(row.detail)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
      : `<p class="empty">No vehicles down in shop</p>`;

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dispatch EOD — ${escapeHtml(payload.dealershipName)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif;
        color: #111827;
        background: #fff;
        margin: 0;
        padding: 32px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      h1 {
        margin: 0 0 4px;
        font-size: 22px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .eyebrow {
        margin: 0 0 16px;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #6b7280;
      }
      .meta {
        margin: 0 0 24px;
        font-size: 12px;
        color: #4b5563;
        line-height: 1.6;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 28px;
      }
      .metric {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 12px 14px;
      }
      .metric-label {
        margin: 0 0 6px;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #6b7280;
      }
      .metric-value {
        margin: 0;
        font-size: 24px;
        font-weight: 900;
        line-height: 1;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #374151;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 8px 6px;
        text-align: left;
        vertical-align: top;
      }
      th {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #6b7280;
      }
      .empty {
        margin: 0;
        padding: 24px;
        text-align: center;
        border: 1px dashed #d1d5db;
        border-radius: 12px;
        color: #6b7280;
        font-size: 12px;
      }
      @media print {
        body { padding: 16px; }
      }
    </style>
  </head>
  <body>
    <p class="eyebrow">End of day</p>
    <h1>Dispatch snapshot — down in shop</h1>
    <div class="meta">
      <div><strong>${escapeHtml(payload.dealershipName)}</strong></div>
      <div>Business date: ${escapeHtml(payload.businessDate)}</div>
      <div>Generated: ${escapeHtml(payload.generatedAt)}</div>
    </div>
    <div class="metrics">${metricTiles}</div>
    <h2>Down in shop repair orders</h2>
    ${rowsHtml}
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () { window.print(); }, 300);
      });
    </script>
  </body>
</html>`);

  printWindow.document.close();
  return true;
}
