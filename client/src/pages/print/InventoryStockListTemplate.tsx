import type { InventoryPrintPayload } from './inventoryPrintUtils';
import { getInventoryPrintColumnWidth } from '../warehouse/inventory/inventoryColumns';
import { buildDispatchBarcodeUrl } from './dispatchBarcode';

interface Props {
  data: InventoryPrintPayload;
}

export default function InventoryStockListTemplate({ data }: Props) {
  const { columns, rows, totals } = data;
  const numericCols = new Set(['package_count', 'weight', 'volumetric_weight', 'volume', 'cod_amount', 'unit_price', 'transit_fee', 'thu_ho_khach', 'surcharge', 'total_amount', 'freight']);
  const visibleIds = new Set(columns.map((col) => col.id));
  const totalLabelCol =
    columns.find((col) => col.id === 'customer_name')?.id
    ?? columns.find((col) => col.id === 'order_code')?.id
    ?? columns.find((col) => col.id === 'waybill_code')?.id
    ?? columns.find((col) => col.id !== 'stack_position' && !numericCols.has(col.id))?.id;

  const footerParts: string[] = [];
  if (visibleIds.has('package_count')) footerParts.push(`Tổng kiện: ${totals.package_count}`);
  if (visibleIds.has('weight')) footerParts.push(`Tổng cân: ${totals.weight_kg} kg`);
  if (visibleIds.has('volumetric_weight')) footerParts.push(`Tổng quy đổi: ${totals.volumetric_weight_kg} kg`);
  if (visibleIds.has('volume')) footerParts.push(`Tổng CBM: ${totals.volume_m3}`);
  if (data.showPricing && visibleIds.has('total_amount')) footerParts.push(`Tổng thành tiền: ${totals.total_amount}`);
  if (data.showPricing && visibleIds.has('freight')) footerParts.push(`Tổng cước phí: ${totals.freight}`);

  return (
    <div className="inventory-stock-sheet">
      <h1 className="inventory-stock-title">{data.title || 'Danh sách tồn kho ECO'}</h1>
      <p className="inventory-stock-meta">
        In lúc: {data.printedAt}
        {data.filterSummary ? ` · ${data.filterSummary}` : ''}
      </p>
      <table className="inventory-stock-table inventory-stock-table--inventory">
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.id}
              className={`col-inv-${col.id}`}
              style={{ width: `${getInventoryPrintColumnWidth(col.id, columns.length)}%` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.id} className={`col-inv-${col.id}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={`col-inv-${col.id} ${numericCols.has(col.id) ? 'col-right' : ''}`}
                >
                  {col.id === 'barcode' && row[col.id]
                    ? <img src={buildDispatchBarcodeUrl(row[col.id])} alt={`Mã vạch ${row[col.id]}`} className="dispatch-barcode-image" />
                    : row[col.id] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="inventory-total-row">
            {columns.map((col) => {
              if (col.id === totalLabelCol && !['package_count', 'weight', 'volumetric_weight', 'volume'].includes(col.id)) {
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
              if (col.id === 'volumetric_weight') {
                return (
                  <td key={col.id} className="col-right font-bold">
                    {totals.volumetric_weight_kg}
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
              if (col.id === 'total_amount' && data.showPricing) {
                return (
                  <td key={col.id} className="col-right font-bold">
                    {totals.total_amount}
                  </td>
                );
              }
              if (col.id === 'freight' && data.showPricing) {
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
