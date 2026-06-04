import type { InventoryPrintPayload } from './inventoryPrintUtils';

interface Props {
  data: InventoryPrintPayload;
}

export default function InventoryStockListTemplate({ data }: Props) {
  const { columns, rows, totals, showPricing } = data;
  const numericCols = new Set(['package_count', 'weight', 'volume', 'freight', 'cod_amount']);
  const visibleIds = new Set(columns.map((col) => col.id));
  const firstDataCol = columns[0]?.id;

  const footerParts: string[] = [];
  if (visibleIds.has('package_count')) footerParts.push(`Tổng kiện: ${totals.package_count}`);
  if (visibleIds.has('weight')) footerParts.push(`Tổng kg: ${totals.weight_kg}`);
  if (visibleIds.has('volume')) footerParts.push(`Tổng m³: ${totals.volume_m3}`);
  if (showPricing && visibleIds.has('freight') && totals.freight) {
    footerParts.push(`Tổng cước: ${totals.freight} đ`);
  }

  return (
    <div className="inventory-stock-sheet">
      <h1 className="inventory-stock-title">Bảng kê phát hàng ECO</h1>
      <p className="inventory-stock-meta">
        In lúc: {data.printedAt}
        {data.filterSummary ? ` · ${data.filterSummary}` : ''}
      </p>
      <table className="inventory-stock-table inventory-stock-table--dispatch">
        <thead>
          <tr>
            <th className="col-stt">STT</th>
            {columns.map((col) => (
              <th key={col.id} className={`col-${col.id}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td className="col-stt col-center">{idx + 1}</td>
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={`col-${col.id} ${numericCols.has(col.id) ? 'col-right' : ''}`}
                >
                  {row[col.id] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="inventory-total-row">
            <td className="col-stt col-center font-bold">Σ</td>
            {columns.map((col) => {
              if (col.id === firstDataCol && !['package_count', 'weight', 'volume', 'freight'].includes(col.id)) {
                return (
                  <td key={col.id} className="font-bold">
                    Tổng cộng
                  </td>
                );
              }
              if (col.id === 'package_count') {
                return (
                  <td key={col.id} className="col-right font-bold">
                    {totals.package_count}
                  </td>
                );
              }
              if (col.id === 'weight') {
                return (
                  <td key={col.id} className="col-right font-bold">
                    {totals.weight_kg}
                  </td>
                );
              }
              if (col.id === 'volume') {
                return (
                  <td key={col.id} className="col-right font-bold">
                    {totals.volume_m3}
                  </td>
                );
              }
              if (col.id === 'freight' && showPricing) {
                return (
                  <td key={col.id} className="col-right font-bold">
                    {totals.freight}
                  </td>
                );
              }
              return <td key={col.id} />;
            })}
          </tr>
        </tfoot>
      </table>
      {footerParts.length > 0 && (
        <p className="inventory-stock-footer">{footerParts.join(' · ')}</p>
      )}
    </div>
  );
}
