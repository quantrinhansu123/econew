import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check — không cần đăng nhập' })
  health() {
    return {
      ok: true,
      service: 'eco-transport-api',
      prefix: '/api/v1',
      timestamp: new Date().toISOString(),
    };
  }
}
