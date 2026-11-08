import { Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { AttendanceLocationEntity } from './attendance-location.entity';
import { AttendanceLogEntity } from './attendance-log.entity';
import { AttendanceCheckType as Check, AttendanceLogStatus as Status, AttendanceVerificationMethod as Method } from './attendance.enums';
import { AttendanceService } from './attendance.service';

describe('AttendanceService network attendance', () => {
  const user = { id: '1' } as UserEntity;
  let service: AttendanceService;
  let location: AttendanceLocationEntity;
  const locations = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  const logs = { find: jest.fn(), create: jest.fn(), save: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    location = { id: '10', name: 'Văn phòng HAN', address: null, latitude: null, longitude: null, radius_meters: 100, verification_method: Method.IP, allowed_ips: ['8.8.8.8'], is_active: true } as AttendanceLocationEntity;
    locations.find.mockResolvedValue([location]);
    locations.findOne.mockResolvedValue(location);
    locations.create.mockImplementation((value) => value);
    locations.save.mockImplementation(async (value) => value);
    logs.find.mockResolvedValue([]);
    logs.create.mockImplementation((value) => value);
    logs.save.mockImplementation(async (value) => ({ id: '100', ...value }));
    service = new AttendanceService(locations as unknown as Repository<AttendanceLocationEntity>, logs as unknown as Repository<AttendanceLogEntity>);
  });

  it('checks in on an allowed network without coordinates and records the server IP', async () => {
    const result = await service.checkAttendance(user, { type: Check.CHECK_IN }, 'test browser', '::ffff:8.8.8.8');
    expect(result).toMatchObject({ success: true, verification_method: Method.IP, distance_meters: null, accuracy_warning: false });
    expect(result.location).not.toHaveProperty('allowed_ips');
    expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({ source_ip: '8.8.8.8', verification_method: Method.IP, user_latitude: null, user_longitude: null, status: Status.SUCCESS }));
  });

  it.each(['1.1.1.1', '127.0.0.1', undefined])('rejects changed, local or missing IP %s and logs the attempt', async (ip) => {
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, ip)).rejects.toMatchObject({ status: 422 });
    expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({ status: Status.FAILED, failure_reason: 'NETWORK_NOT_ALLOWED' }));
  });

  it('cannot bypass an IP location by sending GPS coordinates', async () => {
    location.latitude = 21;
    location.longitude = 105;
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN, latitude: 21, longitude: 105, accuracy: 5 }, undefined, '1.1.1.1')).rejects.toMatchObject({ status: 422 });
  });

  it('does not accept disabled locations', async () => {
    locations.find.mockResolvedValue([]);
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, '8.8.8.8')).rejects.toMatchObject({ status: 422 });
    expect(locations.find).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }));
    expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({ failure_reason: 'NO_ACTIVE_LOCATION' }));
  });

  it('keeps GPS verification and requires all GPS measurements for GPS points', async () => {
    Object.assign(location, { verification_method: Method.GPS, latitude: 21, longitude: 105, allowed_ips: [] });
    const result = await service.checkAttendance(user, { type: Check.CHECK_IN, latitude: 21, longitude: 105, accuracy: 60 }, undefined, '1.1.1.1');
    expect(result).toMatchObject({ success: true, verification_method: Method.GPS, distance_meters: 0, accuracy_warning: true });
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, '1.1.1.1')).rejects.toMatchObject({ status: 422 });
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN, latitude: 22, longitude: 105, accuracy: 5 }, undefined, '1.1.1.1')).rejects.toMatchObject({ status: 422 });
  });

  it('rejects duplicate check-in, checkout before check-in, and duplicate checkout', async () => {
    logs.find.mockResolvedValue([{ type: Check.CHECK_IN }]);
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, '8.8.8.8')).rejects.toMatchObject({ status: 400 });
    logs.find.mockResolvedValue([]);
    await expect(service.checkAttendance(user, { type: Check.CHECK_OUT }, undefined, '8.8.8.8')).rejects.toMatchObject({ status: 400 });
    logs.find.mockResolvedValue([{ type: Check.CHECK_IN }, { type: Check.CHECK_OUT }]);
    await expect(service.checkAttendance(user, { type: Check.CHECK_OUT }, undefined, '8.8.8.8')).rejects.toMatchObject({ status: 400 });
  });

  it('allows checkout after check-in and translates concurrent duplicate inserts', async () => {
    logs.find.mockResolvedValue([{ type: Check.CHECK_IN }]);
    await expect(service.checkAttendance(user, { type: Check.CHECK_OUT }, undefined, '8.8.8.8')).resolves.toMatchObject({ success: true });
    logs.find.mockResolvedValue([]);
    logs.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, '8.8.8.8')).rejects.toMatchObject({ status: 400 });
    expect(logs.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: Status.FAILED, failure_reason: 'DUPLICATE_CHECK' }));
  });

  it('updates a dynamic IP without resetting the location settings', async () => {
    location.is_active = false;
    location.radius_meters = 250;
    const result = await service.updateLocation('10', { allowed_ips: ['1.1.1.1'] });
    expect(result).toMatchObject({ name: 'Văn phòng HAN', is_active: false, radius_meters: 250, allowed_ips: ['1.1.1.1'] });
    await expect(service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, '8.8.8.8')).rejects.toMatchObject({ status: 422 });
  });

  it('requires a public network for IP locations and coordinates for GPS locations', async () => {
    await expect(service.createLocation({ name: 'IP', verification_method: Method.IP, allowed_ips: ['192.168.1.1'] }, user)).rejects.toMatchObject({ status: 400 });
    await expect(service.createLocation({ name: 'IP', verification_method: Method.IP }, user)).rejects.toMatchObject({ status: 400 });
    await expect(service.createLocation({ name: 'GPS' }, user)).rejects.toMatchObject({ status: 400 });
    await expect(service.createLocation({ name: 'IP', verification_method: Method.IP, allowed_ips: ['8.8.8.8'] }, user)).resolves.toMatchObject({ latitude: null, longitude: null, allowed_ips: ['8.8.8.8'] });
  });

  it('uses the Vietnamese work date for morning attendance and today status', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T23:30:00Z'));
    try {
      await service.checkAttendance(user, { type: Check.CHECK_IN }, undefined, '8.8.8.8');
      expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({ work_date: '2026-11-09' }));
      await expect(service.getTodayStatus(user)).resolves.toMatchObject({ date: '2026-11-09' });
      expect(logs.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ work_date: '2026-11-09' }) }));
    } finally { jest.useRealTimers(); }
  });

  it('does not expose the registered address list on employee endpoints', async () => {
    expect(await service.listActiveLocations()).toEqual([expect.not.objectContaining({ allowed_ips: expect.anything() })]);
    expect(await service.getNetworkStatus('8.8.8.8')).toEqual({ ip: '8.8.8.8', is_public: true, matched_location: { id: '10', name: 'Văn phòng HAN' }, gps_available: false });
  });
});
