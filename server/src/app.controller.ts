import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildHealthResponse } from './health-response';

@ApiTags('Health')
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check — không cần đăng nhập' })
  health() {
    return buildHealthResponse();
  }
}
