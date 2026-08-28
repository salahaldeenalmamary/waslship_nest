import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationParamsDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageNumber: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 10;
}

export class PagedResult<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;

  constructor(items: T[], totalCount: number, pageNumber: number, pageSize: number) {
    this.items = items;
    this.totalCount = totalCount;
    this.pageNumber = pageNumber;
    this.pageSize = pageSize;
    this.totalPages = Math.ceil(totalCount / pageSize);
    this.hasPreviousPage = pageNumber > 1;
    this.hasNextPage = pageNumber < this.totalPages;
  }
}
