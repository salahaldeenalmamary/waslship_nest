import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Locations & Cities')
@Controller('api/locations')
export class LocationsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get Saudi & regional cities and governorates' })
  @ApiQuery({ name: 'type', required: false, example: 'City' })
  async getLocations(@Query('type') type?: string) {
    return this.usersService.getLocations(type);
  }
}
