import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const SHIPMENT_AUDIT_KEY = 'SHIPMENT_AUDIT_ACTION';

export interface ShipmentAuditOptions {
  action: string;
  description?: string;
}

/**
 * Decorator to mark controller routes for automated administrative audit logging.
 * Captures the authenticated admin, IP, user-agent, target shipment, and records state transitions with timestamps.
 */
export const TrackShipmentAudit = (
  actionOrOptions: string | ShipmentAuditOptions,
): CustomDecorator<string> => {
  const options: ShipmentAuditOptions =
    typeof actionOrOptions === 'string'
      ? { action: actionOrOptions }
      : actionOrOptions;
  return SetMetadata(SHIPMENT_AUDIT_KEY, options);
};
