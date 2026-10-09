import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('API request sharing and reference cache', () => {
  const fetchMock = vi.fn();
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    storage = new MemoryStorage();
    storage.setItem('eco_access_token', 'test-user-a');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('window', { location: { pathname: '/', origin: 'http://localhost' }, dispatchEvent: vi.fn() });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shares concurrent GETs but reloads financial data after they settle', async () => {
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValue(json({ balance: 200 }));
    const { apiRequest } = await import('./api');
    const first = apiRequest('/waybills/cash-vouchers?ma_kh=TANLB');
    const second = apiRequest('/waybills/cash-vouchers?ma_kh=TANLB');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(json({ balance: 100 }));
    expect(await Promise.all([first, second])).toEqual([{ balance: 100 }, { balance: 100 }]);
    expect(await apiRequest('/waybills/cash-vouchers?ma_kh=TANLB')).toEqual({ balance: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches hub/vendor/route directories with query parameters and expiry', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    fetchMock.mockImplementation(async () => json([{ id: '1' }]));
    const { apiRequest } = await import('./api');
    for (const path of ['/hubs/active?limit=100', '/vendors/active?limit=100', '/routes/active']) {
      await apiRequest(path);
      await apiRequest(path);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    now.mockReturnValue(62000);
    await apiRequest('/vendors/active?limit=100');
    await apiRequest('/hubs/active?limit=100');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps each caller and the cached payload isolated from local edits', async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: '1', name: 'Original' }] }));
    const { apiRequest } = await import('./api');
    type Payload = { items: Array<{ id: string; name: string }> };
    const [first, second] = await Promise.all([apiRequest<Payload>('/hubs/active'), apiRequest<Payload>('/hubs/active')]);
    first.items[0].name = 'Edited locally';
    expect(second.items[0].name).toBe('Original');
    expect((await apiRequest<Payload>('/hubs/active')).items[0].name).toBe('Original');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never shares responses between different accounts or explicit tokens', async () => {
    fetchMock.mockImplementation(async (_url, options) => json({ account: options.headers.Authorization }));
    const { apiRequest } = await import('./api');
    expect(await apiRequest('/hubs/active')).toEqual({ account: 'Bearer test-user-a' });
    storage.setItem('eco_access_token', 'test-user-b');
    expect(await apiRequest('/hubs/active')).toEqual({ account: 'Bearer test-user-b' });
    expect(await apiRequest('/hubs/active', { token: 'test-explicit' })).toEqual({ account: 'Bearer test-explicit' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not let an older request refill the cache after a mutation', async () => {
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json(['new']));
    const { apiRequest } = await import('./api');
    const before = apiRequest('/hubs/active');
    await apiRequest('/hubs/1', { method: 'PATCH', body: { name: 'New' } });
    expect(await apiRequest('/hubs/active')).toEqual(['new']);
    old.resolve(json(['old']));
    await before;
    expect(await apiRequest('/hubs/active')).toEqual(['new']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('invalidates pending financial GETs when a payment is submitted', async () => {
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ paid: 100 }));
    const { apiRequest } = await import('./api');
    const before = apiRequest('/waybills/cash-vouchers');
    await apiRequest('/waybills/cash-vouchers/bulk-payment', { method: 'POST', body: {} });
    expect(await apiRequest('/waybills/cash-vouchers')).toEqual({ paid: 100 });
    old.resolve(json({ paid: 0 }));
    await before;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears the session cache and prevents a late response from restoring it', async () => {
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(json(['fresh']));
    const { apiRequest, clearAuthSession } = await import('./api');
    const before = apiRequest('/hubs/active');
    clearAuthSession();
    storage.setItem('eco_access_token', 'test-user-a');
    old.resolve(json(['old']));
    await before;
    expect(await apiRequest('/hubs/active')).toEqual(['fresh']);
  });

  it('keeps independently cancellable requests separate and preserves abort errors', async () => {
    fetchMock.mockImplementation(async () => json([]));
    const { apiRequest } = await import('./api');
    await Promise.all([
      apiRequest('/hubs/active', { signal: new AbortController().signal }),
      apiRequest('/hubs/active', { signal: new AbortController().signal }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(aborted);
    await expect(apiRequest('/hubs/active', { signal: controller.signal })).rejects.toBe(aborted);
  });

  it('does not reuse failed requests, custom headers, or POSTs', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Failed' }, 500)).mockImplementation(async () => json([]));
    const { apiRequest } = await import('./api');
    await expect(apiRequest('/hubs/active')).rejects.toMatchObject({ status: 500 });
    await apiRequest('/hubs/active');
    await Promise.all([
      apiRequest('/vendors', { method: 'POST', body: {} }), apiRequest('/vendors', { method: 'POST', body: {} }),
      apiRequest('/hubs/active', { headers: { Authorization: 'Bearer explicit-header' } }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
