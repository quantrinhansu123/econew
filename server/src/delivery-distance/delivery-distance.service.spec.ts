import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { DeliveryDistanceService, getHubLatLng, selectDeliveryLocation } from './delivery-distance.service';
import { DeliveryDistanceUsage, HereEndpoint, HereQuotaService } from './here-quota.service';

const location = (overrides = {}) => ({
  title: 'Bưu điện Trung tâm', resultType: 'houseNumber',
  address: { countryCode: 'VNM', label: '2 Công xã Paris, HCM', houseNumber: '2' },
  position: { lat: 10.78, lng: 106.7 }, access: [{ lat: 10.779971, lng: 106.700052 }],
  scoring: { queryScore: 0.98, fieldScore: { houseNumber: 1, streets: [1] } }, ...overrides,
});

describe('DeliveryDistanceService with HERE', () => {
  let service: DeliveryDistanceService;
  let findOne: jest.Mock;
  let reserve: jest.Mock;
  let recordResponse: jest.Mock;
  let fetchMock: jest.SpyInstance;
  let configured: boolean;
  let used: Record<HereEndpoint, number>;
  let quota: HereQuotaService;
  const dto = { dest_hub_id: '2', receiver_address: '2 Công xã Paris, HCM, Việt Nam' };
  const coordinatesDto = { dest_hub_id: '2', receiver_coordinates: '10.779971,106.700052' };
  const getUsage = async (): Promise<DeliveryDistanceUsage> => ({
    provider: 'HERE', configured, observed_at: new Date().toISOString(), month: '2026-10',
    ...Object.fromEntries(['directions', 'geocoding'].map(endpoint => [endpoint, {
      used: used[endpoint as HereEndpoint], limit: 30000, free_limit: 30000, remaining: Math.max(0, 30000 - used[endpoint as HereEndpoint]),
      resets_at: '2026-11-01T00:00:00Z', minute_used: 0, minute_limit: 60, minute_remaining: 60, minute_resets_at: null,
      blocked_until: null, blocked: used[endpoint as HereEndpoint] >= 30000,
    }])),
  } as DeliveryDistanceUsage);

  beforeEach(() => {
    configured = true;
    used = { directions: 0, geocoding: 0 };
    reserve = jest.fn(async (endpoint: HereEndpoint) => {
      if (used[endpoint] >= 30000) throw new HttpException({ message: 'Hết lượt', usage: await getUsage() }, 429);
      used[endpoint]++;
      return '2026-10-01';
    });
    recordResponse = jest.fn().mockResolvedValue(undefined);
    quota = { get configured() { return configured; }, getUsage, reserve, recordResponse,
      throwBlocked: async () => { throw new HttpException({ message: 'Hết lượt', usage: await getUsage() }, 429); },
    } as unknown as HereQuotaService;
    findOne = jest.fn().mockResolvedValue({ id: '2', name: 'HUB HCM', coordinates: '10.762622,106.660172' });
    service = new DeliveryDistanceService({ get: () => 'test-server-key' } as unknown as ConfigService, { findOne } as unknown as Repository<HubEntity>, quota);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => new Response(JSON.stringify(
      String(url).includes('/geocode') ? { items: [location()] } : { routes: [{ sections: [{ summary: { length: 18650, duration: 1500 } }] }] },
    ), { status: 200 }));
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('reads counters without a provider request', async () => {
    expect(await service.getUsage()).toMatchObject({ provider: 'HERE', directions: { limit: 30000 }, geocoding: { limit: 30000 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not call HERE until enabled', async () => {
    configured = false;
    await expect(service.estimate(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('validates the hub and coordinates without using quota', async () => {
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ coordinates: 'bad GPS' });
    await expect(service.estimate(dto)).rejects.toMatchObject({ status: 404 });
    await expect(service.estimate(dto)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.estimate({ ...coordinatesDto, receiver_coordinates: '0,0' })).rejects.toBeInstanceOf(BadRequestException);
    expect(reserve).not.toHaveBeenCalled();
  });
  it('requests only Geocoding and basic car Routing, with time-aware features disabled', async () => {
    const result = await service.estimate(dto);
    expect(result).toMatchObject({ provider: 'HERE', distance_meters: 18650, approximate_address: false,
      usage: { directions: { used: 1 }, geocoding: { used: 1 } } });
    const geocode = new URL(fetchMock.mock.calls[0][0]);
    expect(geocode.origin).toBe('https://geocode.search.hereapi.com');
    expect(geocode.searchParams.get('in')).toBe('countryCode:VNM');
    expect(geocode.searchParams.get('q')).toBe(dto.receiver_address);
    const route = new URL(fetchMock.mock.calls[1][0]);
    expect(route.origin).toBe('https://router.hereapi.com');
    expect(route.searchParams.get('destination')).toBe('10.779971,106.700052');
    expect(Object.fromEntries(route.searchParams)).toMatchObject({
      transportMode: 'car', departureTime: 'any', 'traffic[mode]': 'disabled', return: 'summary', alternatives: '0',
    });
    expect(route.searchParams.has('arrivalTime')).toBe(false);
    expect(route.searchParams.has('spans')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('test-server-key');
  });
  it('supports coordinates without spending a Geocoding request', async () => {
    used.geocoding = 30000;
    expect((await service.estimate(coordinatesDto)).location_source).toBe('COORDINATES');
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledWith('directions');
  });
  it('uses the selected destination hub, including Hanoi', async () => {
    findOne.mockResolvedValue({ name: 'HUB HAN', coordinates: '21.03,105.8' });
    await service.estimate({ dest_hub_id: '1', receiver_coordinates: '21.04,105.81' });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('origin')).toBe('21.03,105.8');
  });
  it('blocks at the Routing limit without first spending Geocoding', async () => {
    used.directions = 30000;
    await expect(service.estimate(dto)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not call Routing if Geocoding cannot resolve a specific location', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [location({ resultType: 'locality' })] })));
    await expect(service.estimate(dto)).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(used.directions).toBe(0);
  });
  it('sums every section instead of returning only the first section length', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ routes: [{ sections: [
      { summary: { length: 1100, duration: 100 } }, { summary: { length: 2200, duration: 200 } },
    ] }] })));
    expect(await service.estimate(coordinatesDto)).toMatchObject({ distance_meters: 3300, duration_seconds: 300 });
  });
  it.each([
    {}, { routes: [] }, { routes: [{ sections: [] }] },
    { routes: [{ sections: [{ summary: { length: -1, duration: 100 } }] }] },
    { routes: [{ sections: [{ summary: { length: 100 } }] }] },
    { routes: [{ sections: [{ summary: { length: 100, duration: 50 }, notices: [{ severity: 'critical' }] }] }] },
  ])('rejects invalid or critically restricted routes: %o', async body => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    await expect(service.estimate(coordinatesDto)).rejects.toMatchObject({ status: 422 });
  });
  it('does not call the provider if database reservation fails', async () => {
    reserve.mockRejectedValue(new Error('database unavailable'));
    await expect(service.estimate(dto)).rejects.toThrow('database unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('never retries a failed provider response: %s', async status => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'raw secret=test-server-key' }), { status }));
    await expect(service.estimate(coordinatesDto)).rejects.toMatchObject({ status: status === 429 ? 429 : 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(used.directions).toBe(1);
    expect(recordResponse).toHaveBeenCalledWith('directions', '2026-10-01', expect.any(Response));
  });
  it('keeps the reservation and sanitizes network errors', async () => {
    fetchMock.mockRejectedValue(new Error('https://router.hereapi.com?apiKey=test-server-key'));
    try { await service.estimate(coordinatesDto); throw new Error('should fail'); }
    catch (error) {
      expect(error).toMatchObject({ status: 502 });
      expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('test-server-key');
    }
    expect(used.directions).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('aborts timed out requests without retrying', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const result = service.estimate(coordinatesDto);
    const assertion = expect(result).rejects.toMatchObject({ status: 502 });
    await jest.advanceTimersByTimeAsync(12500);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('HERE destination selection', () => {
  it('uses the access point instead of the center of a property', () => {
    expect(selectDeliveryLocation({ items: [location()] })?.point).toEqual({ latitude: 10.779971, longitude: 106.700052 });
  });
  it.each([
    { resultType: 'locality' }, { resultType: 'street' }, { address: { countryCode: 'USA' } },
    { scoring: { queryScore: 0.5 } }, { scoring: { queryScore: 1, fieldScore: { houseNumber: 0.1 } } },
  ])('rejects a vague, foreign or mismatched address: %o', change => {
    expect(selectDeliveryLocation({ items: [location(change)] })).toBeNull();
  });
  it('rejects two similarly scored locations in different neighborhoods', () => {
    expect(selectDeliveryLocation({ items: [location(), location({ access: [{ lat: 10.9, lng: 106.8 }] })] })).toBeNull();
  });
  it('marks a lower-confidence resolved address as approximate', () => {
    expect(selectDeliveryLocation({ items: [location({ scoring: { queryScore: 0.8, fieldScore: { houseNumber: 1 } } })] })?.approximate).toBe(true);
  });
  it('respects the coordinates string edited in the hub form', () => {
    expect(getHubLatLng({ coordinates: '21.03,105.8', latitude: 10.7, longitude: 106.7 } as HubEntity)).toEqual({ latitude: 21.03, longitude: 105.8 });
  });
});
