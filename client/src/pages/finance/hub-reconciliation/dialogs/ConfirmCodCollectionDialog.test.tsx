import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ConfirmCodCollectionDialog from './ConfirmCodCollectionDialog';
import type { CashFund } from '../types';

function renderDialog(funds: CashFund[]) {
  return renderToStaticMarkup(<ConfirmCodCollectionDialog
    waybill={{ id: '1', dest_hub_id: '2', collector_hub_name: 'Bưu cục HCM', cod_amount: 400000, collect_amount: 400000 }}
    funds={funds} fundId="shared" note="" submitting={false} error=""
    onFundChange={() => {}} onNoteChange={() => {}} onClose={() => {}}
    onSubmit={() => {}} onManageFunds={() => {}}
  />);
}

describe('ConfirmCodCollectionDialog', () => {
  it('offers existing active funds independently of the collecting HUB', () => {
    const html = renderDialog([
      { id: 'shared', code: 'CHUNG', name: 'Quỹ chung', hub_id: null, is_active: true },
      { id: 'han', code: 'HAN', name: 'Quỹ Hà Nội', hub_id: '1', is_active: true },
      { id: 'inactive', code: 'CU', name: 'Quỹ ngừng sử dụng', hub_id: '2', is_active: false },
    ]);
    expect(html).toContain('value="shared"');
    expect(html).toContain('value="han"');
    expect(html).not.toContain('value="inactive"');
    expect(html).toContain('Bưu cục thu');
    expect(html).toContain('Bưu cục HCM');
    expect(html).not.toContain('Chưa có sổ quỹ đang hoạt động');
  });

  it('explains when there are no active funds without requiring a HUB-specific fund', () => {
    expect(renderDialog([])).toContain('Chưa có sổ quỹ đang hoạt động');
  });
});
