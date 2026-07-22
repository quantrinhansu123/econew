import { describe, expect, it } from 'vitest';
import { getVisibleItems, moduleData } from './moduleData';
import { getVisibleMenu } from './sidebarMenu';

const ACCOUNTANT = 16;

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
