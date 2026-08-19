import { describe, expect, it } from 'vitest';
import { getVisibleItems, moduleData } from './moduleData';
import { getVisibleMenu } from './sidebarMenu';

const ACCOUNTANT = 16;
const DISPATCHER = 8;

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
