import { BadGatewayException, BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { EstimateDeliveryDistanceDto } from './dto/estimate-delivery-distance.dto';
import { HereEndpoint, HereQuotaService } from './here-quota.service';

const HERE_TIMEOUT_MS = 12_000;
const VN_BOUNDS = { minLat: 8, maxLat: 24, minLon: 102, maxLon: 110 };
export interface LatLng { latitude: number; longitude: number }
interface HerePoint { lat?: number; lng?: number }
interface HereLocation {
  title?: string;
  resultType?: string;
  address?: { label?: string; countryCode?: string; houseNumber?: string };
  position?: HerePoint;
  access?: HerePoint[];
  scoring?: { queryScore?: number; fieldScore?: { houseNumber?: number; streets?: number[] } };
}
interface GeocodingResponse { items?: HereLocation[] }
interface DirectionsResponse {
  routes?: Array<{ sections?: Array<{
    summary?: { length?: number; duration?: number };
    notices?: Array<{ severity?: string }>;
  }> }>;
}

export function parseDeliveryCoordinates(text: string): LatLng {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) throw new BadRequestException('Tọa độ không hợp lệ. Nhập vĩ độ,kinh độ, ví dụ 10.779971,106.700052.');
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new BadRequestException('Tọa độ GPS nằm ngoài phạm vi hợp lệ.');
  }
  return { latitude, longitude };
}

export function getHubLatLng(hub: Pick<HubEntity, 'coordinates' | 'latitude' | 'longitude'>): LatLng {
  if (hub.coordinates?.trim()) return parseDeliveryCoordinates(hub.coordinates);
  if (hub.latitude == null || hub.longitude == null) {
    throw new BadRequestException('HUB đến chưa có GPS. Cập nhật vị trí HUB trong quản lý bưu cục trước khi tính km.');
  }
  return parseDeliveryCoordinates(`${hub.latitude},${hub.longitude}`);
}

function vietnamPoint(point?: HerePoint): point is { lat: number; lng: number } {
  return typeof point?.lat === 'number' && Number.isFinite(point.lat) && typeof point.lng === 'number' && Number.isFinite(point.lng)
    && point.lat >= VN_BOUNDS.minLat && point.lat <= VN_BOUNDS.maxLat && point.lng >= VN_BOUNDS.minLon && point.lng <= VN_BOUNDS.maxLon;
}

export function selectDeliveryLocation(data: GeocodingResponse) {
  const candidates = (data.items || []).filter(item => {
    if (item.address?.countryCode !== 'VNM' || !['houseNumber', 'place'].includes(item.resultType || '')) return false;
    if (!Number.isFinite(item.scoring?.queryScore) || item.scoring!.queryScore! < 0.75) return false;
    if (item.resultType === 'houseNumber' && (item.scoring?.fieldScore?.houseNumber ?? 0) < 0.8) return false;
    return vietnamPoint(item.access?.[0] || item.position);
  }).sort((a, b) => b.scoring!.queryScore! - a.scoring!.queryScore!);
  const selected = candidates[0];
  if (!selected) return null;
  const point = selected.access?.[0] || selected.position!;
  const second = candidates[1];
  if (second && selected.scoring!.queryScore! - second.scoring!.queryScore! <= 0.05) {
    const other = second.access?.[0] || second.position!;
    // Similar matches in different neighborhoods need a more specific address.
    const roughKm = Math.hypot((point.lat! - other.lat!) * 111, (point.lng! - other.lng!) * 109);
    if (roughKm > 0.3) return null;
  }
  return {
    point: { latitude: point.lat!, longitude: point.lng! },
    label: selected.address?.label || selected.title || 'Điểm giao HERE tìm được',
    approximate: selected.scoring!.queryScore! < 0.95 || (selected.resultType === 'houseNumber' && selected.scoring?.fieldScore?.houseNumber !== 1),
  };
}

@Injectable()
export class DeliveryDistanceService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(HubEntity) private readonly hubs: Repository<HubEntity>,
    private readonly quota: HereQuotaService,
  ) {}

  getUsage() { return this.quota.getUsage(); }

  private async callHere<T>(endpoint: HereEndpoint, url: URL): Promise<T> {
    const month = await this.quota.reserve(endpoint);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), HERE_TIMEOUT_MS);
    // HERE REST uses an API-key query parameter. Never log the URL or raw errors.
    url.searchParams.set('apiKey', this.config.get<string>('HERE_API_KEY')!.trim());
    try {
      const response = await fetch(url.toString(), { method: 'GET', redirect: 'error', signal: abort.signal, headers: { Accept: 'application/json' } });
      await this.quota.recordResponse(endpoint, month, response);
      if (response.status === 429) await this.quota.throwBlocked(endpoint);
      if (!response.ok) {
        throw new BadGatewayException({
          message: response.status === 401 || response.status === 403
            ? 'HERE chưa cấp quyền cho khóa/dịch vụ này. Quản trị viên cần kiểm tra cấu hình.'
            : 'HERE chưa xử lý được yêu cầu. Kiểm tra địa chỉ hoặc tọa độ rồi thử lại.',
          usage: await this.getUsage(),
        });
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException({
        message: 'Không nhận được kết quả HERE. Lượt đã gửi vẫn được giữ trong hạn mức dự phòng; không tự gọi lại.',
        usage: await this.getUsage(),
      });
    } finally { clearTimeout(timeout); }
  }

  async estimate(dto: EstimateDeliveryDistanceDto) {
    if (!this.quota.configured) {
      throw new ServiceUnavailableException({ message: 'Chưa bật HERE. Liên hệ quản trị viên cấu hình tính khoảng cách.', usage: await this.getUsage() });
    }
    const address = dto.receiver_address?.trim() || '';
    let point = dto.receiver_coordinates ? parseDeliveryCoordinates(dto.receiver_coordinates) : null;
    if (point && !vietnamPoint({ lat: point.latitude, lng: point.longitude })) throw new BadRequestException('Điểm giao phải nằm trong phạm vi Việt Nam.');
    if (!point && (address.length < 5 || address.length > 500)) throw new BadRequestException('Nhập địa chỉ giao đầy đủ hoặc tọa độ điểm giao.');
    const hub = await this.hubs.findOne({ where: { id: dto.dest_hub_id, is_active: true, deleted_at: IsNull() } });
    if (!hub) throw new NotFoundException('Không tìm thấy HUB đến đang hoạt động.');
    const origin = getHubLatLng(hub);
    if (!vietnamPoint({ lat: origin.latitude, lng: origin.longitude })) throw new BadRequestException('GPS HUB phải nằm trong phạm vi Việt Nam.');
    const before = await this.getUsage();
    if (before.directions.blocked) await this.quota.throwBlocked('directions');
    let approximate = false;
    let matchedAddress = 'Tọa độ điểm giao do người nhập cung cấp';
    const source = point ? 'COORDINATES' : 'ADDRESS';
    if (!point) {
      const geocode = new URL('https://geocode.search.hereapi.com/v1/geocode');
      geocode.search = new URLSearchParams({ q: address, in: 'countryCode:VNM', at: `${origin.latitude},${origin.longitude}`, lang: 'vi-VN', limit: '5' }).toString();
      const match = selectDeliveryLocation(await this.callHere<GeocodingResponse>('geocoding', geocode));
      if (!match) {
        throw new HttpException({
          message: 'HERE chưa tìm được địa chỉ cụ thể hoặc có nhiều điểm gần giống nhau. Bổ sung số nhà/ngõ/phường/tỉnh hoặc dán tọa độ cổng giao hàng.',
          usage: await this.getUsage(),
        }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      point = match.point;
      matchedAddress = match.label;
      approximate = match.approximate;
    }
    const route = new URL('https://router.hereapi.com/v8/routes');
    route.search = new URLSearchParams({
      origin: `${origin.latitude},${origin.longitude}`, destination: `${point.latitude},${point.longitude}`,
      transportMode: 'car', routingMode: 'fast', return: 'summary', alternatives: '0',
      // Explicitly avoid the separate, smaller Time Aware Routing SKU.
      departureTime: 'any', 'traffic[mode]': 'disabled',
    }).toString();
    const data = await this.callHere<DirectionsResponse>('directions', route);
    const sections = data.routes?.[0]?.sections;
    if (!sections?.length || sections.some(section => section.notices?.some(notice => notice.severity === 'critical')
      || !Number.isFinite(section.summary?.length) || section.summary!.length! < 0
      || !Number.isFinite(section.summary?.duration) || section.summary!.duration! < 0)) {
      throw new HttpException({ message: 'HERE chưa trả về tuyến ô tô phù hợp. Kiểm tra cổng vào/đường tiếp cận của điểm giao.', usage: await this.getUsage() }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return {
      provider: 'HERE' as const,
      distance_meters: sections.reduce((sum, section) => sum + section.summary!.length!, 0),
      duration_seconds: sections.reduce((sum, section) => sum + section.summary!.duration!, 0),
      approximate_address: approximate, matched_address: matchedAddress, location_source: source,
      destination: point, hub_name: hub.name,
      maps_url: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: `${origin.latitude},${origin.longitude}`, destination: `${point.latitude},${point.longitude}`, travelmode: 'driving' })}`,
      usage: await this.getUsage(),
    };
  }
}
