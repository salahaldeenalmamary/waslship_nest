import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from '../services/health.service';

@ApiTags('System & Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'System & Database Health Check', description: 'Validates database connection and queries active status' })
  @ApiResponse({ status: 200, description: 'Application and Database are healthy' })
  @ApiResponse({ status: 503, description: 'Database connection failed / Service Unavailable' })
  async checkHealth(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('api/health')
  @ApiOperation({ summary: 'System & Database Health Check (API alias)', description: 'Validates database connection and queries active status' })
  @ApiResponse({ status: 200, description: 'Application and Database are healthy' })
  @ApiResponse({ status: 503, description: 'Database connection failed / Service Unavailable' })
  async checkApiHealth(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
