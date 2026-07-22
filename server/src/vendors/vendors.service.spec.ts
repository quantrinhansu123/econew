import { TripStatus, VendorTripPaymentStatus } from '../common/enums';
import { Roles } from '../common/roles';
import { VendorsService } from './vendors.service';

const repositoryMock = () => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const queryBuilderMock = (items: unknown[] = []) => ({
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(items),
});

describe('VendorsService debt tracking', () => {
  let vendorsRepository: ReturnType<typeof repositoryMock>;
  let debtEntriesRepository: ReturnType<typeof repositoryMock>;
  let paymentsRepository: ReturnType<typeof repositoryMock>;
  let tripsRepository: ReturnType<typeof repositoryMock>;
  let manifestWaybillsRepository: ReturnType<typeof repositoryMock>;
  let service: VendorsService;

  const vendor = { id: '1', code: 'NCC01', name: 'Nhà xe đường trục', payable_balance: '0' };
  const trip = {
    id: '5',
    status: TripStatus.IN_TRANSIT,
    departure_time: new Date('2026-07-10T01:00:00.000Z'),
    trip_cost: '1000000',
    other_costs: '0',
    vendor_paid_amount: '0',
    manifest_id: '8',
    manifest: { manifest_code: 'BK-001' },
    truck: { vendor_id: '1', bks: '51H-12345', license_plate: '51H-12345' },
  };

  beforeEach(() => {
    vendorsRepository = repositoryMock();
    debtEntriesRepository = repositoryMock();
    paymentsRepository = repositoryMock();
    tripsRepository = repositoryMock();
    manifestWaybillsRepository = repositoryMock();
    vendorsRepository.findOne.mockResolvedValue({ ...vendor });
    debtEntriesRepository.find.mockResolvedValue([]);
    paymentsRepository.find.mockResolvedValue([]);

    service = new VendorsService(
      vendorsRepository as never,
      debtEntriesRepository as never,
      paymentsRepository as never,
      tripsRepository as never,
      manifestWaybillsRepository as never,
    );
  });

  it('chỉ tổng hợp cước của chuyến đã khởi hành vào công nợ NCC', async () => {
    const tripQb = queryBuilderMock([trip]);
    const paymentQb = queryBuilderMock([]);
    tripsRepository.createQueryBuilder.mockReturnValue(tripQb);
    paymentsRepository.createQueryBuilder.mockReturnValue(paymentQb);

    const result = await service.getDebtDashboard('1', {});

    expect(tripQb.andWhere).toHaveBeenCalledWith('trip.status IN (:...statuses)', {
      statuses: [TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED],
    });
    expect(result.summary).toMatchObject({ trip_count: 1, total_incurred: 1000000 });
    expect(result.balance.remaining_debt).toBe(1000000);
  });

  it('ghi nhận thanh toán và cập nhật trạng thái chuyến được gắn', async () => {
    const tripQb = queryBuilderMock([{ ...trip, vendor_paid_amount: '400000' }]);
    tripsRepository.createQueryBuilder.mockReturnValue(tripQb);
    tripsRepository.find.mockResolvedValue([{ ...trip }]);
    paymentsRepository.save.mockResolvedValue({ id: '9' });
    paymentsRepository.find.mockResolvedValue([{ amount: '400000' }]);
    paymentsRepository.findOne.mockResolvedValue({ id: '9', vendor_id: '1', amount: '400000' });

    const result = await service.recordPayment('1', {
      payment_date: new Date('2026-07-22T00:00:00.000Z'),
      amount: 400000,
      trip_ids: [5],
    }, { id: '2', role_mask: Roles.ACCOUNTANT } as never);

    expect(tripsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: '5',
      vendor_paid_amount: '400000',
      vendor_payment_status: VendorTripPaymentStatus.PARTIAL,
    }));
    expect(vendorsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ payable_balance: '600000' }));
    expect(result).toMatchObject({ id: '9' });
  });
});
