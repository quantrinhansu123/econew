import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HubType } from './dto/create-hub.dto';
import { HubEntity } from './hub.entity';
import { HubsService } from './hubs.service';

const createRepositoryMock = () => ({
  findOne: jest.fn(),
  create: jest.fn((input) => input as HubEntity),
  save: jest.fn((input) => Promise.resolve(input as HubEntity)),
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
  find: jest.fn(),
});

describe('HubsService', () => {
  let service: HubsService;
  let hubsRepository: ReturnType<typeof createRepositoryMock>;
  let waybillsRepository: ReturnType<typeof createRepositoryMock>;
  let tripsRepository: ReturnType<typeof createRepositoryMock>;
  let usersRepository: ReturnType<typeof createRepositoryMock>;
  let userHubsRepository: ReturnType<typeof createRepositoryMock>;

  const hub = {
    id: '1',
    code: 'HAN',
    name: 'Bưu cục Hà Nội',
    type: HubType.HUB,
    province: 'Hà Nội',
    district: 'Cầu Giấy',
    ward: null,
    address: '123 Xuân Thủy',
    phone: null,
    manager_name: null,
    latitude: null,
    longitude: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  } as HubEntity;

  beforeEach(() => {
    hubsRepository = createRepositoryMock();
    waybillsRepository = createRepositoryMock();
    tripsRepository = createRepositoryMock();
    usersRepository = createRepositoryMock();
    userHubsRepository = createRepositoryMock();
    service = new HubsService(hubsRepository as never, waybillsRepository as never, tripsRepository as never, usersRepository as never, userHubsRepository as never);
  });

  it('create creates a hub with normalized code', async () => {
    hubsRepository.findOne.mockResolvedValue(null);

    const result = await service.create({ code: ' han ', name: 'Bưu cục Hà Nội', type: HubType.HUB, province: 'Hà Nội', district: 'Cầu Giấy', address: '123 Xuân Thủy', transit_days: 3 });

    expect(hubsRepository.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'HAN', is_active: true, transit_days: 3 }));
    expect(result.code).toBe('HAN');
  });

  it('create rejects duplicate code', async () => {
    hubsRepository.findOne.mockResolvedValue(hub);

    await expect(service.create({ code: 'han', name: 'Bưu cục Hà Nội', type: HubType.HUB, province: 'Hà Nội', district: 'Cầu Giấy', address: '123 Xuân Thủy' })).rejects.toThrow(ConflictException);
  });

  it('findAll filters by keyword, status, and province', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[hub], 1]),
    };
    hubsRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({ keyword: 'HAN', status: true, province: 'Hà Nội', page: 1, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(3);
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({ items: [hub], meta: { total: 1, page: 1, limit: 10, total_pages: 1 } });
  });

  it('findOne returns hub details', async () => {
    hubsRepository.findOne.mockResolvedValue(hub);
    await expect(service.findOne('1')).resolves.toBe(hub);
  });

  it('findOne rejects missing hub', async () => {
    hubsRepository.findOne.mockResolvedValue(null);
    await expect(service.findOne('404')).rejects.toThrow(NotFoundException);
  });

  it('update rejects missing hub', async () => {
    hubsRepository.findOne.mockResolvedValue(null);
    await expect(service.update('404', { name: 'Updated' })).rejects.toThrow(NotFoundException);
  });

  it('update updates hub data and normalizes code', async () => {
    hubsRepository.findOne.mockResolvedValueOnce(hub).mockResolvedValueOnce(null);

    const result = await service.update('1', { code: ' hcm ', name: 'Bưu cục HCM' });

    expect(result.code).toBe('HCM');
    expect(result.name).toBe('Bưu cục HCM');
    expect(hubsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'HCM' }));
  });

  it('updateStatus activates a hub', async () => {
    hubsRepository.findOne.mockResolvedValue({ ...hub, is_active: false });

    const result = await service.updateStatus('1', { is_active: true });

    expect(result.is_active).toBe(true);
    expect(waybillsRepository.count).not.toHaveBeenCalled();
  });

  it('deactivate hub with active waybills is blocked', async () => {
    hubsRepository.findOne.mockResolvedValue(hub);
    waybillsRepository.count.mockResolvedValue(1);
    tripsRepository.count.mockResolvedValue(0);
    usersRepository.count.mockResolvedValue(0);
    userHubsRepository.count.mockResolvedValue(0);

    await expect(service.updateStatus('1', { is_active: false })).rejects.toThrow(BadRequestException);
  });

  it('remove soft deletes a hub', async () => {
    hubsRepository.findOne.mockResolvedValue({ ...hub });
    waybillsRepository.count.mockResolvedValue(0);
    tripsRepository.count.mockResolvedValue(0);
    usersRepository.count.mockResolvedValue(0);
    userHubsRepository.count.mockResolvedValue(0);

    await service.remove('1');

    expect(hubsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ is_active: false, deleted_at: expect.any(Date) }));
  });

  it('delete hub with active users is blocked', async () => {
    hubsRepository.findOne.mockResolvedValue(hub);
    waybillsRepository.count.mockResolvedValue(0);
    tripsRepository.count.mockResolvedValue(0);
    usersRepository.count.mockResolvedValue(1);
    userHubsRepository.count.mockResolvedValue(0);

    await expect(service.remove('1')).rejects.toThrow(BadRequestException);
  });

  it('findActiveHubs only queries active and not deleted hubs', async () => {
    hubsRepository.find.mockResolvedValue([hub]);

    await expect(service.findActiveHubs()).resolves.toEqual([hub]);

    expect(hubsRepository.find).toHaveBeenCalledWith({ where: { is_active: true, deleted_at: expect.any(Object) }, order: { code: 'ASC' } });
  });
});
