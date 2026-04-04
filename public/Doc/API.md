# Passtest Machine Detector — API Reference

**Base URL:** `https://passtest.poornasreecloud.com`  
**Protocol:** HTTPS only  
**Authentication:** None (public read-only API)  
**Content-Type:** All responses are `application/json`

---

## Response Envelope

Every endpoint returns a consistent JSON envelope:

```json
{
  "success": true | false,
  "data": <object | array | null>,
  "message": "<string, present on error or not-found>"
}
```

List endpoints include an additional `pagination` key alongside `data`.

---

## Endpoints

### 1. Health Check

```
GET /health
```

Verifies the API server is running and the database connection is alive.

**Response — 200 OK**
```json
{
  "success": true,
  "db": "connected",
  "schema": "harisree_db"
}
```

**Response — 503 Service Unavailable** *(DB unreachable)*
```json
{
  "success": false,
  "db": "disconnected",
  "message": "connect ECONNREFUSED ..."
}
```

---

### 2. List Machines

```
GET /api/machines
```

Returns a paginated list of machine test records. All query parameters are optional.

**Query Parameters**

| Parameter  | Type   | Default | Description |
|------------|--------|---------|-------------|
| `page`     | number | `1`     | Page number |
| `limit`    | number | `20`    | Results per page (max `100`) |
| `model`    | string | —       | Filter by model name (partial match, case-insensitive) |
| `customer` | string | —       | Filter by customer name (partial match, case-insensitive) |
| `result`   | string | —       | Filter by test result — `Pass` or `Reject` |
| `product`  | string | —       | Filter by product code (exact match) |

**Example Requests**
```
GET /api/machines
GET /api/machines?page=2&limit=50
GET /api/machines?model=PSR&result=Pass
GET /api/machines?customer=Milma&limit=10
```

**Response — 200 OK**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 342,
    "pages": 18
  },
  "data": [
    {
      "ID": 1100,
      "SerialNo": "PSR-24001",
      "m_model": "PSR-BMC-V3",
      "m_version": "3.2",
      "m_build": "B04",
      "product_code": "BMC300",
      "pass_reject": "Pass",
      "datetime": "2024-10-15T08:30:00.000Z",
      "inspected_by": "Arun",
      "Customer": "Kerala Co-op Milk Marketing Federation",
      ...
    }
  ]
}
```

---

### 3. Machine Full Detail

```
GET /api/machines/:serialNo
```

Returns the complete raw database record for a machine identified by its serial number.

**Path Parameters**

| Parameter  | Description |
|------------|-------------|
| `serialNo` | Machine serial number (e.g. `PSR-24001`) |

**Example Request**
```
GET /api/machines/PSR-24001
```

**Response — 200 OK**
```json
{
  "success": true,
  "count": 1,
  "data": {
    "ID": 1100,
    "SerialNo": "PSR-24001",
    "m_model": "PSR-BMC-V3",
    "m_version": "3.2",
    "m_build": "B04",
    "product_code": "BMC300",
    "pass_reject": "Pass",
    "datetime": "2024-10-15T08:30:00.000Z",
    "inspected_by": "Arun",
    "Customer": "Kerala Co-op Milk Marketing Federation",
    "Address1": "Thiruvananthapuram",
    "Address2": "Kerala",
    "InvNo": "INV-2024-1050",
    "InvDate": "2024-10-16",
    "WARRANTY": 24,
    "m_ser_no": "PCB-001",
    "m_mb_no": "MB-4421",
    "m_sb_no": "SB-2210",
    "m_pump_no": "PMP-0033",
    ...
  }
}
```

**Response — 404 Not Found**
```json
{
  "success": false,
  "message": "No machine found for serial: PSR-99999",
  "data": null
}
```

---

### 4. Machine Summary

```
GET /api/machines/:serialNo/summary
```

Condensed view of a machine — identity, customer info, and test result only. Useful for quick lookups without all the component/calibration noise.

**Path Parameters**

| Parameter  | Description |
|------------|-------------|
| `serialNo` | Machine serial number |

**Example Request**
```
GET /api/machines/PSR-24001/summary
```

**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "serial_no": "PSR-24001",
    "m_model": "PSR-BMC-V3",
    "m_version": "3.2",
    "m_build": "B04",
    "product_code": "BMC300",
    "test_result": "Pass",
    "tested_at": "2024-10-15T08:30:00.000Z",
    "inspected_by": "Arun",
    "customer": "Kerala Co-op Milk Marketing Federation",
    "Address1": "Thiruvananthapuram",
    "Address2": "Kerala",
    "invoice_no": "INV-2024-1050",
    "invoice_date": "2024-10-16",
    "warranty_months": 24
  }
}
```

---

### 5. Machine Components

```
GET /api/machines/:serialNo/components
```

Returns the serial numbers of all internal components (PCBs, pump, display, peripherals, etc.) fitted in the machine.

**Path Parameters**

| Parameter  | Description |
|------------|-------------|
| `serialNo` | Machine serial number |

**Example Request**
```
GET /api/machines/PSR-24001/components
```

**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "serial_no": "PSR-24001",
    "m_ser_no": "PCB-001",
    "m_mb_no": "MB-4421",
    "m_sb_no": "SB-2210",
    "m_pump_no": "PMP-0033",
    "m_232_no": "RS232-009",
    "m_dpst_no": "DPST-114",
    "bp_no": "BP-0077",
    "stirrer_no": "STR-022",
    "printer_no": "PRN-301",
    "rfid_no": "RFID-055",
    "gsm_no": "GSM-088",
    "solarch_no": "SARC-011",
    "adapter_no": "ADP-200",
    "battery_no": "BAT-441",
    "display_no": "DSP-732",
    "keypad_no": "KPD-019",
    "solarpanel_no": "SP-003"
  }
}
```

---

### 6. Machine Calibration

```
GET /api/machines/:serialNo/calibration
```

Returns calibration constants, output configuration, cleaning schedule settings, and access passwords for the machine.

**Path Parameters**

| Parameter  | Description |
|------------|-------------|
| `serialNo` | Machine serial number |

**Example Request**
```
GET /api/machines/PSR-24001/calibration
```

**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "serial_no": "PSR-24001",
    "clr_constant_1": "1.0234",
    "clr_constant_2": "0.9987",
    "output_format": "1",
    "single_continious_data": "C",
    "auto_channel_enable": "1",
    "daily_clean_count": "2",
    "weekly_clean_count": "5",
    "auto_clean_count": "3",
    "idle_clean_time": "30",
    "setup_password": "1234",
    "calibration_password": "5678",
    "engineering_password": "9999"
  }
}
```

---

### 7. Schema Metadata

```
GET /api/schema
```

Returns the live column structure of the `passtestdata` table along with the total number of records. Useful for understanding available fields when building queries.

**Example Request**
```
GET /api/schema
```

**Response — 200 OK**
```json
{
  "success": true,
  "table": "passtestdata",
  "total_rows": 342,
  "data": [
    {
      "name": "ID",
      "position": 1,
      "type": "int",
      "nullable": "NO",
      "key": "PRI"
    },
    {
      "name": "SerialNo",
      "position": 2,
      "type": "varchar",
      "nullable": "YES",
      "key": ""
    },
    ...
  ]
}
```

---

## Error Responses

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `404` | Serial number not found |
| `500` | Internal server error / unexpected DB error |
| `503` | Database connection failure (health endpoint only) |

All error responses follow this shape:
```json
{
  "success": false,
  "message": "Description of the error"
}
```

---

## Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | API & DB health check |
| `GET` | `/api/schema` | Table column metadata + row count |
| `GET` | `/api/machines` | Paginated list with optional filters |
| `GET` | `/api/machines/:serialNo` | Full record for a serial number |
| `GET` | `/api/machines/:serialNo/summary` | Identity + customer + test result |
| `GET` | `/api/machines/:serialNo/components` | Component serial numbers |
| `GET` | `/api/machines/:serialNo/calibration` | Calibration & config parameters |
