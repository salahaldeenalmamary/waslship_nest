# WaslShip Admin API Reference

All endpoints require JWT Bearer authentication header:
`Authorization: Bearer <ADMIN_JWT_TOKEN>`

---

## 1. List Shipments

- **Endpoint:** `GET /api/admin/shipments`
- **Query Params:** `?pageNumber=1&pageSize=10&status=IN_TRANSIT&searchTerm=Riyadh`
- **Request Body:** None

### Response (200 OK)
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "merchantId": "110e8400-e29b-41d4-a716-446655440011",
      "trackingNumber": "WSL10982341",
      "status": "IN_TRANSIT",
      "paymentMethod": "COD",
      "shippingCost": 28.5,
      "codAmount": 150.0,
      "currency": "SAR",
      "carrierName": "SMSA Express",
      "carrierTrackingUrl": "https://smsaexpress.com/track/123456",
      "otoOrderId": "OTO-98214",
      "otoDeliveryFee": 24.0,
      "weightKg": 1.5,
      "piecesCount": 1,
      "packageDescription": "Electronics",
      "notes": "Fragile items",
      "pickupAddress": {
        "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "contactName": "Ahmed Store",
        "contactPhone": "+966501234567",
        "city": "Riyadh",
        "district": "Al Olaya",
        "street": "King Fahd Road"
      },
      "deliveryAddress": {
        "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        "contactName": "Sara Al-Harbi",
        "contactPhone": "+966509876543",
        "city": "Jeddah",
        "district": "Al Rawdah",
        "street": "Madinah Road"
      },
      "createdAt": "2026-09-01T10:00:00.000Z",
      "updatedAt": "2026-09-01T12:00:00.000Z"
    }
  ],
  "total": 1,
  "pageNumber": 1,
  "pageSize": 10,
  "totalPages": 1
}
```

---

## 2. Get Single Shipment Details

- **Endpoint:** `GET /api/admin/shipments/{id}`
- **Request Body:** None

### Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "merchantId": "110e8400-e29b-41d4-a716-446655440011",
  "trackingNumber": "WSL10982341",
  "status": "CREATED",
  "paymentMethod": "COD",
  "shippingCost": 28.5,
  "codAmount": 150.0,
  "currency": "SAR",
  "carrierName": "Aramex",
  "carrierTrackingUrl": "https://www.aramex.com/track/results?mode=0&ShipmentNumber=123456",
  "otoOrderId": "OTO-98214",
  "weightKg": 1.5,
  "piecesCount": 1,
  "pickupAddress": {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "contactName": "Ahmed Store",
    "contactPhone": "+966501234567",
    "city": "Riyadh"
  },
  "deliveryAddress": {
    "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    "contactName": "Sara Al-Harbi",
    "contactPhone": "+966509876543",
    "city": "Jeddah"
  },
  "createdByAdminId": "admin-uuid-123",
  "createdByAdminName": "Admin John",
  "createdAt": "2026-09-01T10:00:00.000Z"
}
```

---

## 3. Create Shipment on Behalf of Merchant

- **Endpoint:** `POST /api/admin/shipments`

### Request Body (JSON)
```json
{
  "merchantId": "110e8400-e29b-41d4-a716-446655440011",
  "pickupAddressId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "deliveryAddressId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "weightKg": 2.0,
  "piecesCount": 1,
  "paymentMethod": "COD",
  "codAmount": 150.0,
  "description": "Smart watch & accessories",
  "deliveryOptionId": "101",
  "notes": "Handle with care"
}
```

### Response (201 Created)
```json
{
  "message": "Shipment created successfully for merchant by Admin",
  "shipment": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "merchantId": "110e8400-e29b-41d4-a716-446655440011",
    "trackingNumber": "WSL78291034",
    "status": "READY_FOR_PICKUP",
    "shippingCost": 28.0,
    "carrierName": "SMSA Express",
    "otoOrderId": "OTO-109283",
    "createdByAdminId": "admin-uuid-123",
    "createdByAdminName": "Admin John"
  },
  "otoOrderId": "OTO-109283",
  "trackingNumber": "WSL78291034"
}
```

---

## 4. Get Merchant Saved Addresses

- **Endpoint:** `GET /api/admin/merchants/{merchantId}/addresses`
- **Request Body:** None

### Response (200 OK)
```json
{
  "merchant": {
    "id": "110e8400-e29b-41d4-a716-446655440011",
    "fullName": "Ahmed Al-Ghamdi",
    "email": "ahmed@merchant.com",
    "phone": "+966501234567",
    "companyName": "Al-Ghamdi Trading"
  },
  "addresses": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "userId": "110e8400-e29b-41d4-a716-446655440011",
      "contactName": "Main Warehouse",
      "contactPhone": "+966501234567",
      "city": "Riyadh",
      "district": "Al Sulaimaniyah",
      "street": "Prince Sultan St",
      "buildingNumber": "12",
      "postalCode": "12221",
      "isDefault": true
    }
  ]
}
```

---

## 5. Add Address for Merchant

- **Endpoint:** `POST /api/admin/merchants/{merchantId}/addresses`

### Request Body (JSON)
```json
{
  "contactName": "Riyadh Branch",
  "contactPhone": "+966509988776",
  "city": "Riyadh",
  "district": "Al Malaz",
  "street": "Salah Al-Din Rd",
  "buildingNumber": "45",
  "postalCode": "12836",
  "country": "Saudi Arabia",
  "isDefault": false
}
```

### Response (201 Created)
```json
{
  "id": "c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  "userId": "110e8400-e29b-41d4-a716-446655440011",
  "contactName": "Riyadh Branch",
  "contactPhone": "+966509988776",
  "city": "Riyadh",
  "district": "Al Malaz",
  "street": "Salah Al-Din Rd",
  "buildingNumber": "45",
  "postalCode": "12836",
  "country": "Saudi Arabia",
  "isDefault": false,
  "createdAt": "2026-09-01T12:30:00.000Z"
}
```

---

## 6. Query Carrier Delivery Options (Step 2)

- **Endpoint:** `GET /api/admin/shipments/{id}/delivery-options`
- **Request Body:** None

### Response (200 OK)
```json
{
  "shipmentId": "550e8400-e29b-41d4-a716-446655440000",
  "trackingNumber": "WSL10982341",
  "otoOrderId": "OTO-98214",
  "pickupCity": "Riyadh",
  "deliveryCity": "Jeddah",
  "options": [
    {
      "deliveryOptionId": "101",
      "companyName": "SMSA Express",
      "deliveryFee": 24.5,
      "avgDeliveryTime": "24-48 Hours",
      "logo": "https://cdn.waslship.com/carriers/smsa.png"
    },
    {
      "deliveryOptionId": "102",
      "companyName": "Aramex",
      "deliveryFee": 28.0,
      "avgDeliveryTime": "48 Hours",
      "logo": "https://cdn.waslship.com/carriers/aramex.png"
    }
  ]
}
```

---

## 7. Select Delivery Option & Finalize Booking (Step 3)

- **Endpoint:** `POST /api/admin/shipments/{id}/select-delivery-option`

### Request Body (JSON)
```json
{
  "deliveryOptionId": "101"
}
```

### Response (200 OK)
```json
{
  "isSuccess": true,
  "message": "Shipment carrier booking completed by Admin.",
  "shipment": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "trackingNumber": "WSL10982341",
    "status": "READY_FOR_PICKUP",
    "carrierName": "SMSA Express",
    "carrierTrackingUrl": "https://smsaexpress.com/track/123456",
    "otoDeliveryFee": 24.5
  }
}
```

---

## 8. Get Shipping Label / AWB

- **Endpoint:** `GET /api/admin/shipments/{id}/label`
- **Request Body:** None

### Response (200 OK)
```json
{
  "shipmentId": "550e8400-e29b-41d4-a716-446655440000",
  "trackingNumber": "WSL10982341",
  "carrierName": "SMSA Express",
  "status": "READY_FOR_PICKUP",
  "senderCity": "Riyadh",
  "recipientCity": "Jeddah",
  "labelUrl": "https://api.waslship.com/labels/WSL10982341.pdf"
}
```

---

## 9. Update Shipment Status

- **Endpoint:** `PUT /api/admin/shipments/{id}/status`

### Request Body (JSON)
```json
{
  "status": "DELIVERED",
  "notes": "Delivered and confirmed by recipient signature"
}
```

### Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "trackingNumber": "WSL10982341",
  "status": "DELIVERED",
  "deliveredAt": "2026-09-01T12:45:00.000Z",
  "lastModifiedByAdminId": "admin-uuid-123",
  "lastModifiedByAdminName": "Admin John",
  "notes": "Delivered and confirmed by recipient signature"
}
```

---

## 10. Cancel Shipment

- **Endpoint:** `POST /api/admin/shipments/{id}/cancel`

### Request Body (JSON)
```json
{
  "reason": "Address outside delivery zone"
}
```

### Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "trackingNumber": "WSL10982341",
  "status": "CANCELLED",
  "notes": "Cancelled by Admin (Admin John). Reason: Address outside delivery zone"
}
```

---

## 11. Hold / Unhold Shipment

### Put on Hold
- **Endpoint:** `POST /api/admin/shipments/{id}/hold`
- **Request Body:** None

#### Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "trackingNumber": "WSL10982341",
  "status": "ON_HOLD",
  "lastModifiedByAdminId": "admin-uuid-123",
  "lastModifiedByAdminName": "Admin John"
}
```

### Release from Hold
- **Endpoint:** `POST /api/admin/shipments/{id}/unhold`
- **Request Body:** None

#### Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "trackingNumber": "WSL10982341",
  "status": "IN_TRANSIT",
  "lastModifiedByAdminId": "admin-uuid-123",
  "lastModifiedByAdminName": "Admin John"
}
```

---

## 12. Update Carrier Information

- **Endpoint:** `PUT /api/admin/shipments/{id}/carrier`

### Request Body (JSON)
```json
{
  "carrierName": "Aramex",
  "carrierTrackingUrl": "https://www.aramex.com/track/123456",
  "otoOrderId": "OTO-99281",
  "otoDeliveryFee": 26.0
}
```

### Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "carrierName": "Aramex",
  "carrierTrackingUrl": "https://www.aramex.com/track/123456",
  "otoOrderId": "OTO-99281",
  "otoDeliveryFee": 26.0,
  "lastModifiedByAdminId": "admin-uuid-123",
  "lastModifiedByAdminName": "Admin John"
}
```

---

## 13. Bulk Status Update

- **Endpoint:** `POST /api/admin/shipments/bulk-status`

### Request Body (JSON)
```json
{
  "shipmentIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ],
  "status": "IN_TRANSIT",
  "notes": "Bulk transit update by Admin"
}
```

### Response (200 OK)
```json
{
  "total": 2,
  "successfulCount": 2,
  "failedCount": 0,
  "errors": [],
  "updatedShipments": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "IN_TRANSIT"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "status": "IN_TRANSIT"
    }
  ]
}
```

---

## 14. Get Shipment Audit Logs

- **Endpoint:** `GET /api/admin/shipments/{id}/audit-logs`
- **Query Params:** `?pageNumber=1&pageSize=50`
- **Request Body:** None

### Response (200 OK)
```json
{
  "items": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440077",
      "shipmentId": "550e8400-e29b-41d4-a716-446655440000",
      "trackingNumber": "WSL10982341",
      "action": "ADMIN_UPDATE_STATUS",
      "fromStatus": "IN_TRANSIT",
      "toStatus": "DELIVERED",
      "adminId": "admin-uuid-123",
      "adminName": "Admin John",
      "adminEmail": "admin@waslship.com",
      "adminRole": "Admin",
      "source": "ADMIN_PORTAL",
      "notes": "Delivered and confirmed by recipient signature",
      "metadata": {
        "paymentMethod": "COD",
        "codAmount": 150.0,
        "shippingCost": 28.5,
        "carrierName": "SMSA Express"
      },
      "createdAt": "2026-09-01T12:45:00.000Z"
    }
  ],
  "total": 1,
  "pageNumber": 1,
  "pageSize": 50,
  "totalPages": 1
}
```

---

## 15. Get All Platform Audit Logs

- **Endpoint:** `GET /api/admin/shipments/audit-logs`
- **Query Params:** `?pageNumber=1&pageSize=20&action=ADMIN_UPDATE_STATUS&adminId=admin-uuid-123`
- **Request Body:** None

### Response (200 OK)
```json
{
  "items": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440077",
      "shipmentId": "550e8400-e29b-41d4-a716-446655440000",
      "trackingNumber": "WSL10982341",
      "action": "ADMIN_UPDATE_STATUS",
      "fromStatus": "IN_TRANSIT",
      "toStatus": "DELIVERED",
      "adminId": "admin-uuid-123",
      "adminName": "Admin John",
      "adminRole": "Admin",
      "source": "ADMIN_PORTAL",
      "createdAt": "2026-09-01T12:45:00.000Z"
    }
  ],
  "total": 1,
  "pageNumber": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

---

## 16. Get Admin Shipment Analytics

- **Endpoint:** `GET /api/admin/shipments/analytics`
- **Request Body:** None

### Response (200 OK)
```json
{
  "totalShipments": 1520,
  "statusBreakdown": {
    "CREATED": 120,
    "READY_FOR_PICKUP": 85,
    "IN_TRANSIT": 310,
    "DELIVERED": 950,
    "CANCELLED": 45,
    "ON_HOLD": 10
  },
  "carrierBreakdown": {
    "SMSA Express": 720,
    "Aramex": 580,
    "OTO": 220
  },
  "paymentMethodBreakdown": {
    "COD": 1100,
    "PREPAID": 300,
    "WALLET": 120
  },
  "financials": {
    "totalShippingCost": 42560.0,
    "totalCodAmount": 234500.0,
    "totalOtoDeliveryFee": 36480.0,
    "currency": "SAR"
  }
}
```

---

## 17. Get Platform Dashboard Overview

- **Endpoint:** `GET /api/admin/dashboard`
- **Request Body:** None

### Response (200 OK)
```json
{
  "totalShipments": 1520,
  "deliveredCount": 950,
  "inTransitCount": 395,
  "cancelledCount": 45,
  "successRate": "95.5%",
  "recentShipments": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "trackingNumber": "WSL10982341",
      "status": "DELIVERED",
      "carrierName": "SMSA Express",
      "shippingCost": 28.5,
      "createdAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

---

## 18. View OTO Webhook Integration Logs

- **Endpoint:** `GET /api/admin/webhooks/logs`
- **Query Params:** `?pageNumber=1&pageSize=20`
- **Request Body:** None

### Response (200 OK)
```json
{
  "items": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440088",
      "eventType": "status_update",
      "otoOrderId": "OTO-98214",
      "trackingNumber": "WSL10982341",
      "isProcessed": true,
      "errorMessage": null,
      "createdAt": "2026-09-01T12:00:00.000Z"
    }
  ],
  "total": 1,
  "pageNumber": 1,
  "pageSize": 20,
  "totalPages": 1
}
```
