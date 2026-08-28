import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  isSuccess: boolean;
  statusCode: number;
  data: T;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((data) => {
        // If data is already formatted or raw buffer/redirect
        if (data && data.isSuccess !== undefined && data.statusCode !== undefined) {
          return data;
        }
        return {
          isSuccess: statusCode >= 200 && statusCode < 300,
          statusCode,
          data: data !== undefined ? data : null,
        };
      }),
    );
  }
}
