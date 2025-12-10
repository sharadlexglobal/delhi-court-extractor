# Delhi Court Case Extractor - Complete Technical Documentation

**Version:** 1.0.0  
**Last Updated:** December 10, 2025  
**Author:** Replit Agent  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [CNR Number Format and Generation](#2-cnr-number-format-and-generation)
3. [Delhi District Court Mappings](#3-delhi-district-court-mappings)
4. [Order URL Construction](#4-order-url-construction)
5. [PDF Download with ZenRows](#5-pdf-download-with-zenrows)
6. [Text Extraction from PDFs](#6-text-extraction-from-pdfs)
7. [AI Classification with OpenAI](#7-ai-classification-with-openai)
8. [Database Schema](#8-database-schema)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [Environment Variables](#10-environment-variables)
11. [Error Codes and Troubleshooting](#11-error-codes-and-troubleshooting)
12. [Verified Test Cases](#12-verified-test-cases)

---

## 1. System Overview

### Purpose
This system automates the extraction of court case data from all 11 Delhi District Courts. It:
- Generates CNR (Case Number Record) numbers for any district
- Constructs URLs to download court order PDFs
- Downloads PDFs using ZenRows API with India proxies (to bypass geo-restrictions)
- Extracts text content from PDFs
- Classifies orders using OpenAI GPT-4o to identify case types, statutory acts, and business leads

### Processing Pipeline
```
CNR Generation → Order URL Creation → PDF Download (ZenRows) → Text Extraction → AI Classification
```

### Technology Stack
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **PDF Processing:** pdf-parse library
- **AI:** OpenAI GPT-4o
- **Web Scraping:** ZenRows API with premium India proxies

---

## 2. CNR Number Format and Generation

### CNR Structure (Delhi Courts)

Every CNR follows this exact format:

```
DL + [CODE_PREFIX] + [ESTABLISHMENT_CODE] + [SERIAL_NUMBER] + [YEAR]
```

| Component | Length | Description | Example |
|-----------|--------|-------------|---------|
| Prefix | 2 | Always "DL" for Delhi | DL |
| Code Prefix | 2 | District identifier | WT (West), CT (Central) |
| Establishment Code | 2 | Always "01" for Delhi district courts | 01 |
| Serial Number | 6 | Zero-padded case serial | 012750 |
| Year | 4 | 4-digit year | 2025 |

### Example CNR Breakdown

**CNR:** `DLWT010127502025`

```
DL   + WT   + 01              + 012750       + 2025
↓      ↓      ↓                 ↓              ↓
Delhi  West   Establishment    Serial #       Year
       Delhi  Code             (padded)
```

### Code Implementation

**File:** `server/routes.ts` (CNR Generation Endpoint)

```typescript
// CNR Generation Formula
const cnr = `DL${district.codePrefix}${district.establishmentCode}${serialNumber.toString().padStart(district.serialWidth, "0")}${year}`;
```

**Key Parameters:**
- `district.serialWidth`: 6 (all Delhi courts use 6-digit serial numbers)
- `district.establishmentCode`: "01" (all Delhi district courts)
- Serial numbers are zero-padded to 6 digits

### Server-Side Limits

```typescript
const MAX_CNRS_PER_REQUEST = 100;  // Maximum CNRs to generate per request
```

---

## 3. Delhi District Court Mappings

### Complete District Configuration (VERIFIED December 10, 2025)

| District | CNR Prefix | Code | Establishment | Base URL |
|----------|------------|------|---------------|----------|
| Central Delhi | DLCT | CT | 01 | https://centraldelhi.dcourts.gov.in |
| East Delhi | DLET | ET | 01 | https://eastdelhi.dcourts.gov.in |
| New Delhi | DLND | ND | 01 | https://newdelhidc.dcourts.gov.in |
| North Delhi | DLNT | NT | 01 | https://northdelhi.dcourts.gov.in |
| North East Delhi | DLNE | NE | 01 | https://northeastdelhi.dcourts.gov.in |
| North West Delhi | DLNW | NW | 01 | https://rohini.dcourts.gov.in |
| Shahdara | DLSH | SH | 01 | https://shahdara.dcourts.gov.in |
| South Delhi | DLST | ST | 01 | https://southdelhi.dcourts.gov.in |
| South East Delhi | DLSE | SE | 01 | https://southeastdelhi.dcourts.gov.in |
| South West Delhi | DLSW | SW | 01 | https://southwestdelhi.dcourts.gov.in |
| West Delhi | DLWT | WT | 01 | https://westdelhi.dcourts.gov.in |

### Database Schema for Districts

```sql
CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code_prefix VARCHAR(10) NOT NULL,        -- "WT", "CT", etc.
    establishment_code VARCHAR(10) NOT NULL, -- Always "01"
    serial_width INTEGER NOT NULL DEFAULT 6, -- Always 6 for Delhi
    year_format VARCHAR(20) NOT NULL DEFAULT '4-digit',
    base_url VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Important Notes

1. **West Delhi (DLWT)** maps to `westdelhi.dcourts.gov.in` (NOT southwestdelhi)
2. **North West Delhi (DLNW)** maps to `rohini.dcourts.gov.in` (special case)
3. All other districts follow the pattern: `{districtname}.dcourts.gov.in`

---

## 4. Order URL Construction

### URL Format

The Delhi courts use a specific AJAX endpoint to serve PDF orders:

```
{BASE_URL}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings={ENCODED_PAYLOAD}
```

### Payload Structure

The `input_strings` parameter is a Base64-encoded JSON object:

```json
{
    "cino": "DLWT010127502025",  // CNR number
    "order_no": 1,               // Order number (1, 2, 3...)
    "order_date": "2025-12-04"   // Date in YYYY-MM-DD format
}
```

### Encoding Process

**Step 1:** Create JSON payload
```javascript
const payload = JSON.stringify({
    cino: "DLWT010127502025",
    order_no: 1,
    order_date: "2025-12-04"
});
```

**Step 2:** Encode to Base64
```javascript
const encodedPayload = Buffer.from(payload).toString("base64");
// Result: eyJjaW5vIjoiRExXVDAxMDEyNzUwMjAyNSIsIm9yZGVyX25vIjoxLCJvcmRlcl9kYXRlIjoiMjAyNS0xMi0wNCJ9
```

**Step 3:** Construct full URL
```javascript
const url = `${baseUrl}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=${encodedPayload}`;
```

### Complete Code Implementation

**File:** `server/routes.ts`

```typescript
// Order URL Generation
for (const dateStr of dateStrings) {
    for (let orderNo = startOrderNo; orderNo <= endOrderNo; orderNo++) {
        const payload = JSON.stringify({
            cino: cnrData.cnr,
            order_no: orderNo,
            order_date: dateStr,  // YYYY-MM-DD format
        });
        const encodedPayload = Buffer.from(payload).toString("base64");
        const url = `${cnrData.district.baseUrl}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=${encodedPayload}`;

        ordersToCreate.push({
            cnrId,
            orderNo,
            orderDate: dateStr,
            url,
            encodedPayload,
        });
    }
}
```

### Server-Side Limits

```typescript
const MAX_DAYS_RANGE = 30;        // Maximum date range
const MAX_ORDER_RANGE = 10;       // Maximum order numbers per CNR
const MAX_ORDERS_PER_REQUEST = 1000;  // Total orders per request
```

### Calculation Formula
```
Total Orders = Number of CNRs × Number of Days × Number of Order Numbers
```

Example: 10 CNRs × 5 days × 2 order numbers = 100 order URLs

---

## 5. PDF Download with ZenRows

### Why ZenRows is Required

1. **Geo-Restriction:** Delhi courts only serve PDFs to Indian IP addresses
2. **JavaScript Rendering:** Some pages require JS execution
3. **Anti-Bot Protection:** Courts may have basic anti-scraping measures

### ZenRows API Configuration

**File:** `server/zenrows-pdf-fetcher.ts`

```typescript
const response = await axios.get('https://api.zenrows.com/v1/', {
    params: {
        url: order.url,           // The court PDF URL
        apikey: apiKey,           // ZENROWS_API_KEY from environment
        premium_proxy: 'true',    // REQUIRED: Use premium proxies
        js_render: 'true',        // REQUIRED: Enable JavaScript rendering
        proxy_country: 'in',      // CRITICAL: India proxy for geo-restriction
    },
    responseType: 'arraybuffer', // Receive binary PDF data
    timeout: 90000,              // 90 second timeout (PDFs can be slow)
});
```

### ZenRows Parameters Explained

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `url` | Court PDF URL | The target URL to fetch |
| `apikey` | Your API key | Authentication |
| `premium_proxy` | `true` | Use premium residential proxies (better success rate) |
| `js_render` | `true` | Execute JavaScript on the page |
| `proxy_country` | `in` | **CRITICAL:** Use India IP address |

### PDF Validation

The system validates downloaded content before saving:

```typescript
function isValidPdf(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;
    const header = buffer.slice(0, 8).toString('ascii');
    return header.startsWith('%PDF-');  // Valid PDFs start with %PDF-
}
```

### Additional Validation Checks

1. **Minimum Size:** PDFs must be > 1000 bytes (error pages are smaller)
2. **Header Check:** Must start with `%PDF-` magic bytes
3. **Error Detection:** Check for "No record found" in response

### Domain Whitelist (Security)

Only these domains are allowed:

```typescript
const ALLOWED_COURT_DOMAINS = [
    'dcourts.gov.in',
    'ecourts.gov.in',
];
```

### Rate Limiting

A 1-second delay between requests prevents overwhelming the court servers:

```typescript
await new Promise(resolve => setTimeout(resolve, 1000));
```

### Complete ZenRows Workflow

```
1. Receive order URL
2. Validate URL domain (must be dcourts.gov.in or ecourts.gov.in)
3. Call ZenRows API with India proxy
4. Receive response (arraybuffer)
5. Validate PDF header (%PDF-)
6. Check minimum size (> 1000 bytes)
7. Store in object storage
8. Update database with path and size
```

### Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Validate PDF content |
| 422 | Unprocessable | No order exists for this date/CNR combination |
| 429 | Rate Limited | Retry with exponential backoff |
| 500+ | Server Error | Retry or mark as failed |

---

## 6. Text Extraction from PDFs

### Library Used
`pdf-parse` - Node.js library for extracting text from PDFs

### Extraction Process

```typescript
import pdfParse from "pdf-parse";

const pdfBuffer = await objectStorage.downloadPdf(order.pdfPath);
const pdfData = await pdfParse(pdfBuffer);

const textData = {
    rawText: pdfData.text,                    // Full extracted text
    cleanedText: cleanText(pdfData.text),     // Cleaned/normalized text
    pageCount: pdfData.numpages,              // Number of pages
    wordCount: pdfData.text.split(/\s+/).length,  // Word count
};
```

### Text Cleaning

```typescript
function cleanText(text: string): string {
    return text
        .replace(/\s+/g, ' ')           // Normalize whitespace
        .replace(/[\r\n]+/g, '\n')      // Normalize line breaks
        .trim();
}
```

### Database Storage

```sql
CREATE TABLE pdf_texts (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL REFERENCES cnr_orders(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    cleaned_text TEXT,
    page_count INTEGER,
    word_count INTEGER,
    extracted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 7. AI Classification with OpenAI

### Model Configuration

**File:** `server/classifier.ts`

```typescript
const API_TIMEOUT_MS = 60000;        // 60 second timeout
const MAX_RETRIES = 4;               // Retry up to 4 times
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second delay

// OpenAI Client Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: API_TIMEOUT_MS,
    maxRetries: 0,  // We handle retries ourselves
});
```

### API Call Configuration

```typescript
const response = await openai.chat.completions.create({
    model: "gpt-4o",                           // Model: GPT-4o
    messages: [
        { role: "system", content: CLASSIFICATION_PROMPT },
        { role: "user", content: `Analyze this court order:\n\n${truncatedText}` }
    ],
    response_format: { type: "json_object" },  // Ensure JSON response
    temperature: 0.1,                          // Low temperature for consistency
});
```

### Text Truncation

To stay within token limits, text is truncated:

```typescript
const truncatedText = text.length > 15000 
    ? text.substring(0, 15000) + "..." 
    : text;
```

### Complete Classification Prompt

```
You are a legal document analyzer specializing in Indian court orders from Delhi District Courts. Analyze the following court order text and extract structured information.

## DELHI COURTS CASE TYPE ABBREVIATIONS REFERENCE:
- MACT = Motor Accident Claims Tribunal (under Motor Vehicles Act, 1988)
- NI Act / Section 138 = Negotiable Instruments Act, 1881 (cheque bounce cases)
- IPC = Indian Penal Code, 1860 (criminal cases)
- CPC = Code of Civil Procedure, 1908 (civil procedure)
- CrPC = Code of Criminal Procedure, 1973 (criminal procedure)
- POCSO = Protection of Children from Sexual Offences Act, 2012
- NDPS = Narcotic Drugs and Psychotropic Substances Act, 1985
- SC/ST Act = Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989
- DV Act = Protection of Women from Domestic Violence Act, 2005
- FAO = First Appeal from Order
- RCA = Regular Civil Appeal
- CS = Civil Suit
- CC = Criminal Case / Calendar Case
- ARB = Arbitration & Conciliation Act
- IA = Interlocutory Application
- EA = Execution Application
- Section 125 CrPC = Maintenance applications
- Section 156(3) CrPC = Directing police to investigate

Return a JSON object with the following fields:
{
  "caseTitle": "Full case title (e.g., 'Ashok Kumar Vs. Keshav')",
  "caseNumber": "Case number (e.g., '1156/2025', 'Bail Matter No. 4276/2025')",
  "caseType": "Type of case (civil, criminal, commercial, motor_accident, cheque_bounce, family, etc.)",
  "caseCategory": "Category from: MACT, NI_ACT, IPC, CPC, CrPC, POCSO, NDPS, DV_ACT, ARBITRATION, EXECUTION, MAINTENANCE, OTHER",
  "filingDate": "Filing date in YYYY-MM-DD format if found",
  "petitionerNames": "Names of petitioners/plaintiffs separated by commas",
  "respondentNames": "Names of respondents/defendants separated by commas",
  "petitionerAdvocates": "Advocates for petitioners",
  "respondentAdvocates": "Advocates for respondents",
  "judgeName": "Name of the judge",
  "courtName": "Name of the court (e.g., 'MACT-01, West/THC/Delhi')",
  "courtDesignation": "Court designation (e.g., 'District Judge', 'Additional Sessions Judge', 'DJ-cum-PO')",
  "statutoryProvisions": "Legal provisions/sections mentioned (e.g., 'Section 138 NI Act', 'Section 302 IPC')",
  "statutoryActName": "Full statutory act name with abbreviation (e.g., 'MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988', 'NI Act - Negotiable Instruments Act, 1881 (Section 138 - Cheque Dishonour)')",
  "orderType": "Type of order (interim, final, adjournment, summons, notice, bail, registration, etc.)",
  "orderSummary": "Brief summary in 2-3 sentences explaining what happened in the order and what the court decided",
  "operativePortion": "Key operative directions from the order (what the court ordered to be done)",
  "nextHearingDate": "Next hearing date in YYYY-MM-DD format if mentioned",
  "isSummonsOrder": true if this order issues summons to any party,
  "isNoticeOrder": true if this order issues notice to any party,
  "isFreshCaseAssignment": true if this appears to be a new case registration/assignment,
  "isFirstHearing": true if this appears to be the first hearing,
  "isFinalOrder": true if this is a final judgment/decree,
  "hasBusinessEntity": true if any business entities (companies, firms, LLPs) are mentioned,
  "entityTypes": "Types of entities found (Pvt Ltd, LLP, Partnership, Sole Proprietor, etc.)",
  "classificationConfidence": confidence score between 0 and 1,
  "businessEntities": [
    {
      "name": "Full business name as mentioned",
      "entityType": "Pvt Ltd, LLP, Partnership, Sole Proprietor, Public Ltd, etc.",
      "partyRole": "petitioner, respondent, or third_party"
    }
  ],
  "personLeads": [
    {
      "name": "Full name of individual person (NOT a business entity)",
      "partyRole": "petitioner, respondent, or third_party",
      "address": "Address if mentioned in the order, otherwise null"
    }
  ],
  "freshCasePhrase": "Exact phrase that indicates fresh case assignment"
}

## CRITICAL RULES:

1. **FRESH CASE DETECTION**: Set isFreshCaseAssignment=true if the order contains phrases SIMILAR IN MEANING to:
   - "fresh case received, it be checked and registered"
   - "case received and registered"
   - "FAR received, it be checked and registered"
   - "new case filed"
   - "case is registered"
   - "matter is registered"
   Capture the EXACT phrase found in freshCasePhrase field.

2. **STATUTORY ACT IDENTIFICATION**: Based on court name and order content, identify the applicable statutory act:
   - If court mentions "MACT" → "MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988"
   - If mentions Section 138 or cheque → "NI Act - Negotiable Instruments Act, 1881 (Section 138 - Cheque Dishonour)"
   - If criminal case with IPC sections → "IPC - Indian Penal Code, 1860"
   - If maintenance case → "CrPC - Code of Criminal Procedure, 1973 (Section 125 - Maintenance)"

3. **ORDER SUMMARY**: Write a clear, readable summary explaining:
   - What type of case this is
   - What happened in this order
   - What the court decided or ordered
   - Who was present/absent

4. **BUSINESS LEADS**: Extract company/firm names that could be leads for legal/business services.

5. **PERSON LEADS**: For fresh cases, extract individual person names from respondent/defendant side as potential leads.

If a field is not found in the text, use null for strings, false for booleans, and empty array [] for arrays.
```

### Classification Result Structure

```typescript
interface ClassificationResult {
    caseTitle: string | null;
    caseNumber: string | null;
    caseType: string | null;
    caseCategory: string | null;          // MACT, NI_ACT, IPC, etc.
    filingDate: string | null;
    petitionerNames: string | null;
    respondentNames: string | null;
    petitionerAdvocates: string | null;
    respondentAdvocates: string | null;
    judgeName: string | null;
    courtName: string | null;
    courtDesignation: string | null;
    statutoryProvisions: string | null;
    statutoryActName: string | null;      // Full name with abbreviation
    orderType: string | null;
    orderSummary: string | null;
    operativePortion: string | null;
    nextHearingDate: string | null;
    isSummonsOrder: boolean;
    isNoticeOrder: boolean;
    isFreshCaseAssignment: boolean;
    isFirstHearing: boolean;
    isFinalOrder: boolean;
    hasBusinessEntity: boolean;
    entityTypes: string | null;
    classificationConfidence: number;     // 0.0 to 1.0
    businessEntities: Array<{
        name: string;
        entityType: string;
        partyRole: "petitioner" | "respondent" | "third_party";
    }>;
    personLeads: Array<{
        name: string;
        partyRole: "petitioner" | "respondent" | "third_party";
        address: string | null;
    }>;
    freshCasePhrase: string | null;       // Exact phrase from order
}
```

### Case Categories

| Category | Description |
|----------|-------------|
| MACT | Motor Accident Claims Tribunal |
| NI_ACT | Negotiable Instruments Act (Cheque Bounce) |
| IPC | Indian Penal Code (Criminal) |
| CPC | Code of Civil Procedure |
| CrPC | Code of Criminal Procedure |
| POCSO | Child Protection Cases |
| NDPS | Narcotics Cases |
| DV_ACT | Domestic Violence |
| ARBITRATION | Arbitration Matters |
| EXECUTION | Execution Applications |
| MAINTENANCE | Maintenance Cases (Section 125) |
| OTHER | Other/Unclassified |

### Retry Logic

```typescript
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 4
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            const isRetryable = 
                error.message.includes("timeout") || 
                error.message.includes("rate_limit") ||
                error.message.includes("429") ||
                error.message.includes("503") ||
                error.message.includes("529") ||
                error.message.includes("overloaded");
            
            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }
            
            // Exponential backoff: 1s, 2s, 4s, 8s
            const delay = 1000 * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
}
```

---

## 8. Database Schema

### Entity Relationship Diagram

```
districts (1) ←→ (N) cnrs (1) ←→ (N) cnr_orders (1) ←→ (1) pdf_texts
                                           ↓
                                    order_metadata
                                           ↓
                         ┌─────────────────┼─────────────────┐
                         ↓                 ↓                 ↓
                 business_entities   case_entity_links   person_leads
                         ↓
                  entity_contacts
```

### Table: districts

```sql
CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code_prefix VARCHAR(10) NOT NULL,
    establishment_code VARCHAR(10) NOT NULL,
    serial_width INTEGER NOT NULL DEFAULT 6,
    year_format VARCHAR(20) NOT NULL DEFAULT '4-digit',
    base_url VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Table: cnrs

```sql
CREATE TABLE cnrs (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    district_id INTEGER NOT NULL REFERENCES districts(id),
    cnr VARCHAR(50) NOT NULL UNIQUE,
    serial_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    is_valid BOOLEAN,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMP
);

CREATE INDEX idx_cnrs_district ON cnrs(district_id);
CREATE INDEX idx_cnrs_year ON cnrs(year);
```

### Table: cnr_orders

```sql
CREATE TABLE cnr_orders (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    cnr_id INTEGER NOT NULL REFERENCES cnrs(id) ON DELETE CASCADE,
    order_no INTEGER NOT NULL,
    order_date DATE NOT NULL,
    url TEXT NOT NULL,
    encoded_payload TEXT NOT NULL,
    pdf_exists BOOLEAN NOT NULL DEFAULT false,
    pdf_path TEXT,
    pdf_size_bytes INTEGER,
    http_status_code INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_checked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_pdf_exists ON cnr_orders(pdf_exists);
CREATE UNIQUE INDEX uq_cnr_order_date ON cnr_orders(cnr_id, order_no, order_date);
```

### Table: pdf_texts

```sql
CREATE TABLE pdf_texts (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL UNIQUE REFERENCES cnr_orders(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    cleaned_text TEXT,
    page_count INTEGER,
    word_count INTEGER,
    extracted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Table: order_metadata

```sql
CREATE TABLE order_metadata (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL UNIQUE REFERENCES cnr_orders(id) ON DELETE CASCADE,
    case_title TEXT,
    case_number VARCHAR(100),
    case_type VARCHAR(100),
    case_category VARCHAR(100),
    filing_date DATE,
    petitioner_names TEXT,
    respondent_names TEXT,
    petitioner_advocates TEXT,
    respondent_advocates TEXT,
    judge_name VARCHAR(200),
    court_name VARCHAR(200),
    court_designation VARCHAR(100),
    statutory_provisions TEXT,
    statutory_act_name TEXT,
    order_type VARCHAR(100),
    order_summary TEXT,
    fresh_case_phrase TEXT,
    operative_portion TEXT,
    next_hearing_date DATE,
    is_summons_order BOOLEAN NOT NULL DEFAULT false,
    is_notice_order BOOLEAN NOT NULL DEFAULT false,
    is_fresh_case_assignment BOOLEAN NOT NULL DEFAULT false,
    is_first_hearing BOOLEAN NOT NULL DEFAULT false,
    is_final_order BOOLEAN NOT NULL DEFAULT false,
    has_business_entity BOOLEAN NOT NULL DEFAULT false,
    entity_types TEXT,
    classification_confidence REAL,
    llm_model_used VARCHAR(100),
    classified_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metadata_summons ON order_metadata(is_summons_order);
CREATE INDEX idx_metadata_fresh_case ON order_metadata(is_fresh_case_assignment);
CREATE INDEX idx_metadata_business ON order_metadata(has_business_entity);
```

### Table: business_entities

```sql
CREATE TABLE business_entities (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    name_normalized VARCHAR(500) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    cin VARCHAR(50),
    llpin VARCHAR(50),
    gstin VARCHAR(50),
    pan VARCHAR(20),
    registered_address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    company_status VARCHAR(100),
    data_source VARCHAR(100),
    enrichment_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_name ON business_entities(name_normalized);
CREATE INDEX idx_entities_cin ON business_entities(cin);
```

### Table: person_leads

```sql
CREATE TABLE person_leads (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL REFERENCES cnr_orders(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    name_normalized VARCHAR(500) NOT NULL,
    party_role VARCHAR(50) NOT NULL,
    case_type VARCHAR(100),
    case_number VARCHAR(100),
    petitioner_name TEXT,
    is_fresh_case BOOLEAN NOT NULL DEFAULT false,
    fresh_case_phrase TEXT,
    address TEXT,
    next_hearing_date DATE,
    court_name VARCHAR(200),
    judge_name VARCHAR(200),
    confidence REAL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_person_leads_fresh_case ON person_leads(is_fresh_case);
```

---

## 9. API Endpoints Reference

### CNR Generation

**Endpoint:** `POST /api/cnrs/generate`

**Request:**
```json
{
    "districtId": 11,
    "year": 2025,
    "startSerial": 12750,
    "endSerial": 12752
}
```

**Response:**
```json
{
    "message": "Generated 3 CNRs",
    "cnrs": [
        {
            "id": 773,
            "cnr": "DLWT010127502025",
            "serialNumber": 12750,
            "year": 2025
        }
    ]
}
```

### Order URL Generation

**Endpoint:** `POST /api/orders/generate-for-cnrs`

**Request:**
```json
{
    "cnrIds": [773, 774, 775],
    "startDate": "2025-12-03",
    "endDate": "2025-12-05",
    "startOrderNo": 1,
    "endOrderNo": 2
}
```

**Response:**
```json
{
    "message": "Generated 18 order URLs",
    "totalOrders": 18,
    "ordersCreated": 18,
    "duplicatesSkipped": 0
}
```

### PDF Download (ZenRows)

**Endpoint:** `POST /api/jobs/start-pdf-download-zenrows`

**Request:**
```json
{
    "orderIds": [183054, 183055, 183056],
    "limit": 100
}
```

**Response:**
```json
{
    "jobId": 21,
    "totalOrders": 3,
    "message": "Started PDF download job for 3 orders"
}
```

### Text Extraction

**Endpoint:** `POST /api/jobs/extract-texts`

**Request:**
```json
{
    "orderIds": [183055],
    "limit": 100
}
```

**Response:**
```json
{
    "jobId": 22,
    "totalOrders": 1,
    "message": "Started text extraction job for 1 orders"
}
```

### Classification

**Endpoint:** `POST /api/jobs/classify`

**Request:**
```json
{
    "limit": 100
}
```

**Response:**
```json
{
    "jobId": 23,
    "totalOrders": 1,
    "message": "Started classification job for 1 orders"
}
```

### Job Status

**Endpoint:** `GET /api/jobs`

**Response:**
```json
[
    {
        "id": 23,
        "jobType": "classification",
        "status": "completed",
        "totalItems": 1,
        "processedItems": 1,
        "successfulItems": 1,
        "failedItems": 0
    }
]
```

---

## 10. Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `ZENROWS_API_KEY` | ZenRows API key for PDF scraping | `zen_xxxx` |
| `OPENAI_API_KEY` | OpenAI API key for classification | `sk-xxxx` |
| `SESSION_SECRET` | Express session secret | `random-string` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Object storage bucket ID | Auto-created |
| `PRIVATE_OBJECT_DIR` | Private storage directory | `.private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public storage paths | `public` |

---

## 11. Error Codes and Troubleshooting

### HTTP Status Codes from Courts

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | Validate PDF content |
| 422 | No record found | Order does not exist for this CNR/date/order# combo |
| 500 | Server error | Retry later |

### Common Issues

**Issue:** PDF downloads return HTML instead of PDF
- **Cause:** Geo-restriction or bot detection
- **Solution:** Ensure ZenRows `proxy_country=in` is set

**Issue:** CNR not found (422)
- **Cause:** Invalid serial number or date
- **Solution:** Try different dates or serial numbers

**Issue:** Classification returns null
- **Cause:** Empty text or API timeout
- **Solution:** Check text extraction, increase timeout

**Issue:** Wrong domain used
- **Cause:** District mapping error
- **Solution:** Verify `baseUrl` in districts table

### Domain Mapping Verification

If PDFs fail for a district, verify the domain:

```sql
SELECT name, code_prefix, base_url FROM districts WHERE code_prefix = 'WT';
-- Should return: West Delhi, WT, https://westdelhi.dcourts.gov.in
```

---

## 12. Verified Test Cases

### Test Case 1: West Delhi MACT Order

**Date:** December 10, 2025

**Input:**
- District: West Delhi
- CNR: DLWT010127502025
- Serial: 12750
- Year: 2025
- Order Date: 2025-12-04
- Order No: 1

**URL Generated:**
```
https://westdelhi.dcourts.gov.in/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=eyJjaW5vIjoiRExXVDAxMDEyNzUwMjAyNSIsIm9yZGVyX25vIjoxLCJvcmRlcl9kYXRlIjoiMjAyNS0xMi0wNCJ9
```

**Results:**
- PDF Downloaded: Yes (98,183 bytes)
- Text Extracted: Yes (word count varies)
- Classification:
  - Case Title: "Ashok Kumar Vs. Keshav"
  - Case Category: MACT
  - Statutory Act: "MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988"
  - Fresh Case: Yes
  - Fresh Case Phrase: "FAR received. It be checked and registered"
  - Confidence: 95%

### Payload Decoded

```json
{
    "cino": "DLWT010127502025",
    "order_no": 1,
    "order_date": "2025-12-04"
}
```

---

## Appendix A: File Locations

| Purpose | File Path |
|---------|-----------|
| Database Schema | `shared/schema.ts` |
| ZenRows PDF Fetcher | `server/zenrows-pdf-fetcher.ts` |
| OpenAI Classifier | `server/classifier.ts` |
| API Routes | `server/routes.ts` |
| Storage Interface | `server/storage.ts` |
| Object Storage | `server/objectStorage.ts` |
| Frontend Orders Page | `client/src/pages/orders.tsx` |
| Frontend CNR Generator | `client/src/pages/cnr-generator.tsx` |

---

## Appendix B: Quick Reference Card

### CNR Format
```
DL + [2-char district code] + 01 + [6-digit serial] + [4-digit year]
Example: DLWT010127502025
```

### URL Template
```
{BASE_URL}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings={BASE64_PAYLOAD}
```

### Base64 Payload
```json
{"cino":"CNR_NUMBER","order_no":ORDER_NUMBER,"order_date":"YYYY-MM-DD"}
```

### ZenRows Config
```
url, apikey, premium_proxy=true, js_render=true, proxy_country=in
```

### OpenAI Config
```
model=gpt-4o, temperature=0.1, response_format=json_object
```

---

**Document End**
