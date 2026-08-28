import { describe, expect, it } from 'vitest';
import { dashboardModules } from './dashboardModules';

describe('dashboard delivery navigation', () => {
  it('shows a delivery module card that opens the delivery module page', () => {
    expect(dashboardModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Quản lý giao hàng',
          href: '/delivery',
        }),
      ]),
    );
  });

  it('allows warehouse, delivery and management roles to access the module', () => {
    const deliveryModule = dashboardModules.find((module) => module.href === '/delivery');

    expect(deliveryModule?.requiredRoleMask).toBe(1 | 2 | 4 | 8 | 32 | 64);
  });
});
