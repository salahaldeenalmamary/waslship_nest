import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SHIPMENT_AUDIT_KEY, ShipmentAuditOptions } from '../decorators/shipment-audit.decorator';
import { ShipmentAuditService } from '../services/shipment-audit.service';
import { UserRole } from '../../users/enums/user.enum';

@Injectable()
export class ShipmentAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ShipmentAuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: ShipmentAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.getAllAndOverride<ShipmentAuditOptions>(
      SHIPMENT_AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const http = context.switchToHttp();
    const req = http.getRequest();
    const user = req.user;

    // We track requests with audit decorator or administrative actions
    const isAdmin =
      user &&
      (user.role === UserRole.Admin ||
        user.role === UserRole.SuperAdmin ||
        user.role === 'Admin' ||
        user.role === 'SuperAdmin');

    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';
    const userAgent = req.headers['user-agent'] || '';

    return next.handle().pipe(
      tap(async (response) => {
        try {
          if (!auditOptions && !isAdmin) return;

          const actionName =
            auditOptions?.action ||
            `ADMIN_${req.method}_${req.route?.path?.replace(/[^a-zA-Z0-9]/g, '_') || 'ACTION'}`;

          // Resolve shipment ID and tracking number from params, body, or response
          const shipmentId =
            req.params?.id ||
            req.params?.shipmentId ||
            req.body?.shipmentId ||
            response?.shipment?.id ||
            response?.data?.id ||
            response?.data?.shipment?.id ||
            response?.id ||
            null;

          const trackingNumber =
            response?.trackingNumber ||
            response?.shipment?.trackingNumber ||
            response?.data?.trackingNumber ||
            response?.data?.shipment?.trackingNumber ||
            req.body?.trackingNumber ||
            null;

          const fromStatus =
            response?.oldStatus ||
            response?.fromStatus ||
            req.body?.oldStatus ||
            null;

          const toStatus =
            response?.shipment?.status ||
            response?.data?.status ||
            response?.status ||
            req.body?.status ||
            null;

          if (shipmentId) {
            await this.auditService.recordAudit({
              shipmentId,
              trackingNumber,
              action: actionName,
              fromStatus,
              toStatus,
              actor: user
                ? {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    ipAddress: clientIp,
                    userAgent,
                  }
                : null,
              source: isAdmin ? 'ADMIN_PORTAL' : 'SYSTEM',
              notes: req.body?.notes || req.body?.reason || auditOptions?.description || null,
              metadata: {
                method: req.method,
                path: req.originalUrl || req.url,
                body: this.sanitizeBody(req.body),
              },
            });
          }
        } catch (err: any) {
          this.logger.warn(`ShipmentAuditInterceptor non-blocking error: ${err.message}`);
        }
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const sanitized = { ...body };
    const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'otpCode'];
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '***REDACTED***';
      }
    }
    return sanitized;
  }
}
