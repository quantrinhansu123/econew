import { describe, expect, it } from 'vitest';
import { getVisibleItems, moduleData } from './moduleData';
import { getVisibleMenu } from './sidebarMenu';

const ACCOUNTANT = 16;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

describe('accountant waybill navigation', () => {
  it('shows the orders module in the sidebar', () => {
    expect(getVisibleMenu(ACCOUNTANT).map((item) => item.path)).toContain('/orders');
  });

  it('shows the shared waybill list without exposing order creation', () => {
    const orderGroup = moduleData['/orders'][0];
    const paths = getVisibleItems(orderGroup, ACCOUNTANT).map((item) => item.path);

    expect(paths).toContain('/warehouse/orders');
    expect(paths).not.toContain('/orders/new');
  });
});

describe('director-only payroll navigation', () => {
  const financeGroup = moduleData['/finance'][0];

  it('hides salary advances and payroll from accountants and managers', () => {
    for (const roleMask of [ACCOUNTANT, MANAGER]) {
      const paths = getVisibleItems(financeGroup, roleMask).map((item) => item.path);
      expect(paths).not.toContain('/finance/salary-advances');
      expect(paths).not.toContain('/finance/payroll');
    }
  });

  it('shows salary advances and payroll to directors', () => {
    const paths = getVisibleItems(financeGroup, DIRECTOR).map((item) => item.path);
    expect(paths).toContain('/finance/salary-advances');
    expect(paths).toContain('/finance/payroll');
    expect(getVisibleMenu(DIRECTOR).map((item) => item.path)).toContain('/finance');
  });
});

describe('dispatcher inventory navigation', () => {
  it('shows the warehouse module in the sidebar', () => {
    expect(getVisibleMenu(DISPATCHER).map((item) => item.path)).toContain('/warehouse');
  });

  it('shows inventory without exposing warehouse-only order pages', () => {
    const warehouseGroup = moduleData['/warehouse'][0];
    const paths = getVisibleItems(warehouseGroup, DISPATCHER).map((item) => item.path);

    expect(paths).toContain('/warehouse/inventory');
    expect(paths).not.toContain('/warehouse/orders');
  });
});
