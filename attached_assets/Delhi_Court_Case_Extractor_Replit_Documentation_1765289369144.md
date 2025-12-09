# Delhi Court Case Extractor & Business Lead Generator
## Complete Production-Ready Documentation for Replit AI Development

---

# TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Project Overview & Goals](#2-project-overview--goals)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Database Schema](#5-database-schema)
6. [CNR Number Generation System](#6-cnr-number-generation-system)
7. [URL Generation & PDF Fetching](#7-url-generation--pdf-fetching)
8. [PDF Text Extraction](#8-pdf-text-extraction)
9. [LLM Classification Engine](#9-llm-classification-engine)
10. [Business Entity Contact Enrichment](#10-business-entity-contact-enrichment)
11. [Backend API Specification](#11-backend-api-specification)
12. [Frontend Design System](#12-frontend-design-system)
13. [Complete File Structure](#13-complete-file-structure)
14. [Implementation Code](#14-implementation-code)
15. [Deployment & Configuration](#15-deployment--configuration)

---

# 1. EXECUTIVE SUMMARY

## 1.1 What This Application Does

This application is a comprehensive legal intelligence platform that:

1. **Automatically extracts PDFs** of newly filed court cases from all 11 Delhi district courts
2. **Analyzes court orders** using AI to extract structured legal metadata
3. **Identifies business entities** (Companies, LLPs, GST-registered firms) against whom cases have been filed
4. **Fetches contact information** of these entities using external APIs
5. **Presents all data** in a beautiful, ultra-premium dashboard interface

## 1.2 Business Value

- **For Legal Professionals**: Automated lead generation for potential clients who need legal representation
- **For Research**: Comprehensive database of newly filed cases across Delhi courts
- **For Business Intelligence**: Track litigation patterns against specific types of businesses

## 1.3 Key Features

- CNR-based case discovery across all 11 Delhi districts
- Automatic PDF detection and download
- AI-powered order classification and summarization
- Detection of TWO key order types:
  - Summons/Notice Issued Orders
  - "Fresh Case Received by Way of Assignment" Orders (new case registration)
- Business entity identification and contact enrichment
- Ultra-premium, visually stunning dashboard interface
- Real-time data visualization and filtering

---

# 2. PROJECT OVERVIEW & GOALS

## 2.1 Primary Goals

### Goal 1: Comprehensive Case Discovery
Generate CNR (Case Number Record) numbers systematically to discover ALL newly filed cases in Delhi district courts by:
- Using fixed state/district prefixes for each of 11 districts
- Auto-incrementing serial numbers
- Checking multiple date ranges and order numbers

### Goal 2: PDF Extraction & Storage
For each valid CNR:
- Generate URLs for the next 30 days from today (India time)
- Check order numbers 1-10 for each date
- Download and store any PDFs that exist
- Log all results in PostgreSQL

### Goal 3: Intelligent Classification
Use LLM to extract from each PDF:
- Case title, case number, parties
- Judge name, court designation
- Statutory provisions cited
- Order summary and operative portion
- **Special Detection**:
  - Summons/Notices issued (especially to business entities)
  - "Fresh case received by way of assignment, it be checked and registered" orders

### Goal 4: Business Lead Generation
- Identify companies, LLPs, and GST-registered entities
- Fetch contact details (email, phone, address, directors) via external APIs
- Create actionable lead lists

### Goal 5: Premium User Experience
- Beautiful, ultra-premium frontend design
- Real-time data visualization
- Advanced filtering and search
- Export capabilities

---

# 3. SYSTEM ARCHITECTURE

## 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYER                                  │
│                    React + TypeScript + TailwindCSS                         │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐     │
│  │ Dashboard │ │CNR Gen UI │ │Order View │ │Lead Mgmt  │ │ Analytics │     │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               API GATEWAY                                    │
│                          FastAPI + Uvicorn                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│   CNR Generator     │   │   PDF Processor     │   │   Classification    │
│   Service           │   │   Service           │   │   Service           │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────────┐  │
│  │      PostgreSQL         │   │           File Storage                  │  │
│  │  Districts, CNRs,       │   │  /data/pdfs/{cnr}/                      │  │
│  │  Orders, Metadata,      │   │      {date}_order{n}.pdf                │  │
│  │  Entities, Contacts     │   │                                         │  │
│  └─────────────────────────┘   └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 Data Flow

```
[User Input: District + Serial Range + Year]
        │
        ▼
┌───────────────────────┐
│  CNR Generation       │ → Build CNR strings, Validate format
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  URL Generation       │ → 30 days × 10 orders, Base64 encoding
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  PDF Check & Download │ → HTTP GET, Save to filesystem
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  Text Extraction      │ → PyMuPDF processing, Store raw text
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  LLM Classification   │ → Structured prompt, Entity detection
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  Contact Enrichment   │ → MCA API lookup, Store contacts
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  Frontend Display     │ → Dashboard views, Filtering & search
└───────────────────────┘
```

---

# 4. TECHNOLOGY STACK

## 4.1 Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Python 3.11+ | Core backend language |
| Web Framework | FastAPI | High-performance async API |
| ASGI Server | Uvicorn | Production server |
| ORM | SQLAlchemy 2.0+ | Database abstraction |
| HTTP Client | httpx | Async HTTP requests |
| PDF Processing | PyMuPDF (fitz) | Fast PDF text extraction |
| Validation | Pydantic | Data validation & schemas |

## 4.2 Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 18+ | UI framework |
| Language | TypeScript | Type safety |
| Styling | TailwindCSS | Utility-first CSS |
| Charts | Recharts | Data visualization |
| Tables | TanStack Table | Advanced data tables |
| State | Zustand | State management |
| Animations | Framer Motion | Smooth animations |

## 4.3 Requirements Files

### requirements.txt (Backend)
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
sqlalchemy==2.0.23
asyncpg==0.29.0
psycopg2-binary==2.9.9
alembic==1.12.1
httpx==0.25.2
aiofiles==23.2.1
PyMuPDF==1.23.7
pydantic==2.5.2
pydantic-settings==2.1.0
openai==1.3.7
anthropic==0.7.7
apscheduler==3.10.4
python-dateutil==2.8.2
python-dotenv==1.0.0
tenacity==8.2.3
loguru==0.7.2
```

### package.json (Frontend)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.1",
    "typescript": "^5.3.2",
    "@tanstack/react-table": "^8.10.7",
    "axios": "^1.6.2",
    "zustand": "^4.4.7",
    "recharts": "^2.10.3",
    "framer-motion": "^10.16.16",
    "lucide-react": "^0.294.0",
    "date-fns": "^2.30.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.1.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "vite": "^5.0.8"
  }
}
```

---

# 5. DATABASE SCHEMA

## 5.1 Complete SQL Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLE: districts - Configuration for all 11 Delhi district courts
CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code_prefix VARCHAR(10) NOT NULL,
    establishment_code VARCHAR(10) NOT NULL,
    serial_width INTEGER NOT NULL DEFAULT 7,
    year_format VARCHAR(20) NOT NULL DEFAULT '3-digit',
    base_url VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE: cnrs - Store generated CNR numbers
CREATE TABLE cnrs (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    district_id INTEGER NOT NULL REFERENCES districts(id),
    cnr VARCHAR(50) NOT NULL UNIQUE,
    serial_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    is_valid BOOLEAN DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ
);

CREATE INDEX idx_cnrs_district ON cnrs(district_id);
CREATE INDEX idx_cnrs_year ON cnrs(year);

-- TABLE: cnr_orders - Store URL combinations for each CNR
CREATE TABLE cnr_orders (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    cnr_id INTEGER NOT NULL REFERENCES cnrs(id) ON DELETE CASCADE,
    order_no INTEGER NOT NULL,
    order_date DATE NOT NULL,
    url TEXT NOT NULL,
    encoded_payload TEXT NOT NULL,
    pdf_exists BOOLEAN NOT NULL DEFAULT FALSE,
    pdf_path TEXT,
    pdf_size_bytes INTEGER,
    http_status_code INTEGER,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cnr_order_date UNIQUE (cnr_id, order_no, order_date)
);

CREATE INDEX idx_orders_pdf_exists ON cnr_orders(pdf_exists) WHERE pdf_exists = TRUE;

-- TABLE: pdf_texts - Store extracted text from PDFs
CREATE TABLE pdf_texts (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL REFERENCES cnr_orders(id) ON DELETE CASCADE UNIQUE,
    raw_text TEXT NOT NULL,
    cleaned_text TEXT,
    page_count INTEGER,
    word_count INTEGER,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE: order_metadata - LLM-extracted structured metadata
CREATE TABLE order_metadata (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL REFERENCES cnr_orders(id) ON DELETE CASCADE UNIQUE,
    
    -- Case identification
    case_title TEXT,
    case_number VARCHAR(100),
    case_type VARCHAR(100),
    filing_date DATE,
    
    -- Parties
    petitioner_names TEXT,
    respondent_names TEXT,
    petitioner_advocates TEXT,
    respondent_advocates TEXT,
    
    -- Court details
    judge_name VARCHAR(200),
    court_name VARCHAR(200),
    court_designation VARCHAR(100),
    
    -- Legal details
    statutory_provisions TEXT,
    
    -- Order analysis
    order_type VARCHAR(100),
    order_summary TEXT,
    operative_portion TEXT,
    next_hearing_date DATE,
    
    -- CRITICAL FLAGS
    is_summons_order BOOLEAN NOT NULL DEFAULT FALSE,
    is_notice_order BOOLEAN NOT NULL DEFAULT FALSE,
    is_fresh_case_assignment BOOLEAN NOT NULL DEFAULT FALSE,
    is_first_hearing BOOLEAN NOT NULL DEFAULT FALSE,
    is_final_order BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Entity detection
    has_business_entity BOOLEAN NOT NULL DEFAULT FALSE,
    entity_types TEXT,
    
    -- Audit
    classification_confidence FLOAT,
    llm_model_used VARCHAR(100),
    classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metadata_summons ON order_metadata(is_summons_order) WHERE is_summons_order = TRUE;
CREATE INDEX idx_metadata_fresh_case ON order_metadata(is_fresh_case_assignment) WHERE is_fresh_case_assignment = TRUE;
CREATE INDEX idx_metadata_business ON order_metadata(has_business_entity) WHERE has_business_entity = TRUE;

-- TABLE: business_entities - Identified business entities
CREATE TABLE business_entities (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_name ON business_entities(name_normalized);
CREATE INDEX idx_entities_cin ON business_entities(cin) WHERE cin IS NOT NULL;

-- TABLE: entity_contacts - Directors/contacts for entities
CREATE TABLE entity_contacts (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
    contact_type VARCHAR(50) NOT NULL,
    name VARCHAR(300),
    designation VARCHAR(200),
    din VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE: case_entity_links - Link cases to entities
CREATE TABLE case_entity_links (
    id SERIAL PRIMARY KEY,
    cnr_order_id INTEGER NOT NULL REFERENCES cnr_orders(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
    party_role VARCHAR(50) NOT NULL,
    confidence FLOAT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_case_entity UNIQUE (cnr_order_id, entity_id)
);

-- TABLE: processing_jobs - Track batch processing
CREATE TABLE processing_jobs (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_items INTEGER NOT NULL DEFAULT 0,
    processed_items INTEGER NOT NULL DEFAULT 0,
    successful_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,
    parameters TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VIEW: Business leads
CREATE VIEW v_business_leads AS
SELECT 
    be.id as entity_id,
    be.name as entity_name,
    be.entity_type,
    be.cin,
    be.gstin,
    be.email,
    be.phone,
    be.registered_address,
    be.city,
    om.case_number,
    om.case_title,
    om.case_type,
    om.judge_name,
    om.order_summary,
    om.is_summons_order,
    om.is_notice_order,
    om.is_fresh_case_assignment,
    co.order_date,
    co.pdf_path,
    c.cnr,
    d.name as district_name
FROM business_entities be
JOIN case_entity_links cel ON be.id = cel.entity_id
JOIN cnr_orders co ON cel.cnr_order_id = co.id
JOIN order_metadata om ON co.id = om.cnr_order_id
JOIN cnrs c ON co.cnr_id = c.id
JOIN districts d ON c.district_id = d.id
WHERE cel.party_role IN ('Respondent', 'Defendant', 'Accused')
  AND (om.is_summons_order = TRUE OR om.is_notice_order = TRUE OR om.is_fresh_case_assignment = TRUE)
ORDER BY co.order_date DESC;

-- SEED DATA: Delhi Districts
INSERT INTO districts (name, code_prefix, establishment_code, serial_width, year_format, base_url) VALUES
('Central Delhi', 'DLCE', '01', 7, '3-digit', 'https://centraldelhi.dcourts.gov.in'),
('East Delhi', 'DLEA', '01', 7, '3-digit', 'https://eastdelhi.dcourts.gov.in'),
('New Delhi', 'DLND', '01', 7, '3-digit', 'https://newdelhi.dcourts.gov.in'),
('North Delhi', 'DLNO', '01', 7, '3-digit', 'https://northdelhi.dcourts.gov.in'),
('North East Delhi', 'DLNE', '01', 7, '3-digit', 'https://northeastdelhi.dcourts.gov.in'),
('North West Delhi', 'DLNW', '01', 7, '3-digit', 'https://northwestdelhi.dcourts.gov.in'),
('Shahdara Delhi', 'DLSH', '01', 7, '3-digit', 'https://shahdara.dcourts.gov.in'),
('South Delhi', 'DLSO', '01', 7, '3-digit', 'https://southdelhi.dcourts.gov.in'),
('South East Delhi', 'DLSE', '01', 7, '3-digit', 'https://southeastdelhi.dcourts.gov.in'),
('South West Delhi', 'DLSW', '01', 7, '3-digit', 'https://southwestdelhi.dcourts.gov.in'),
('West Delhi', 'DLWE', '01', 7, '3-digit', 'https://westdelhi.dcourts.gov.in');
```

---

# 6. CNR NUMBER GENERATION SYSTEM

## 6.1 CNR Structure

```
Example CNR: DLSW010000272019 (16 characters)

Breakdown:
┌────┬────┬─────────┬───────┬──────┐
│ DL │ SW │ 01      │0000272│ 019  │
├────┼────┼─────────┼───────┼──────┤
│State│Dist│Est.Code │Serial │ Year │
│ 2  │ 2  │   2     │  7    │  3   │
└────┴────┴─────────┴───────┴──────┘
```

## 6.2 CNR Generator Code

```python
# services/cnr_generator.py

from datetime import date
from typing import Generator
from dataclasses import dataclass

@dataclass
class CNRConfig:
    district_key: str
    state_code: str
    district_code: str
    establishment_code: str
    serial_width: int
    year_format: str
    base_url: str

def format_year(year: int, fmt: str) -> str:
    if fmt == "3-digit":
        return str(year - 2000).zfill(3)
    elif fmt == "4-digit":
        return str(year)
    elif fmt == "2-digit":
        return str(year)[-2:]
    else:
        raise ValueError(f"Unsupported year format: {fmt}")

def build_cnr(config: CNRConfig, serial_number: int, year: int) -> str:
    serial_str = str(serial_number).zfill(config.serial_width)
    year_str = format_year(year, config.year_format)
    return f"{config.state_code}{config.district_code}{config.establishment_code}{serial_str}{year_str}"

def generate_cnrs(
    config: CNRConfig,
    start_serial: int,
    end_serial: int,
    year: int
) -> Generator[str, None, None]:
    for serial in range(start_serial, end_serial + 1):
        yield build_cnr(config, serial, year)
```

---

# 7. URL GENERATION & PDF FETCHING

## 7.1 URL Structure

```
Base URL Pattern:
https://{district}.dcourts.gov.in/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings={encoded_payload}

JSON Payload:
{
    "cino": "DLSW010000272019",
    "order_no": 1,
    "order_date": "2024-01-15"
}
```

## 7.2 URL Builder Code

```python
# services/url_builder.py

import base64
import json
from datetime import date, datetime, timedelta
from typing import List, Dict
from zoneinfo import ZoneInfo
from dataclasses import dataclass

INDIA_TZ = ZoneInfo("Asia/Kolkata")

@dataclass
class OrderURL:
    cnr: str
    order_no: int
    order_date: date
    url: str
    encoded_payload: str
    payload: Dict

def get_india_today() -> date:
    return datetime.now(INDIA_TZ).date()

def build_order_payload(cnr: str, order_no: int, order_date: date) -> Dict:
    return {
        "cino": cnr,
        "order_no": order_no,
        "order_date": order_date.isoformat()
    }

def encode_payload(payload: Dict) -> str:
    json_str = json.dumps(payload, separators=(',', ':'))
    return base64.b64encode(json_str.encode('utf-8')).decode('utf-8')

def build_order_url(base_url: str, encoded_payload: str) -> str:
    return (
        f"{base_url}/wp-admin/admin-ajax.php"
        f"?es_ajax_request=1&action=get_order_pdf&input_strings={encoded_payload}"
    )

def generate_order_urls(
    cnr: str,
    base_url: str,
    days_ahead: int = 30,
    max_order_no: int = 10,
    start_date: date = None
) -> List[OrderURL]:
    if start_date is None:
        start_date = get_india_today()
    
    urls = []
    for day_offset in range(days_ahead):
        order_date = start_date + timedelta(days=day_offset)
        for order_no in range(1, max_order_no + 1):
            payload = build_order_payload(cnr, order_no, order_date)
            encoded = encode_payload(payload)
            url = build_order_url(base_url, encoded)
            urls.append(OrderURL(
                cnr=cnr,
                order_no=order_no,
                order_date=order_date,
                url=url,
                encoded_payload=encoded,
                payload=payload
            ))
    return urls
```

## 7.3 PDF Fetcher Code

```python
# services/pdf_fetcher.py

import os
import asyncio
from datetime import datetime
from typing import Optional
from dataclasses import dataclass
import httpx
from loguru import logger

@dataclass
class PDFResult:
    url: str
    success: bool
    http_status: int
    content_type: Optional[str]
    pdf_bytes: Optional[bytes]
    file_path: Optional[str]
    error_message: Optional[str]

class PDFFetcher:
    def __init__(
        self,
        storage_path: str = "data/pdfs",
        timeout: float = 30.0,
        rate_limit_delay: float = 0.5
    ):
        self.storage_path = storage_path
        self.timeout = timeout
        self.rate_limit_delay = rate_limit_delay
        os.makedirs(storage_path, exist_ok=True)
        
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/pdf,*/*"
            }
        )
    
    async def fetch_pdf(self, url: str) -> PDFResult:
        try:
            response = await self.client.get(url)
            content_type = response.headers.get("Content-Type", "")
            
            if response.status_code == 200 and "application/pdf" in content_type:
                return PDFResult(
                    url=url,
                    success=True,
                    http_status=response.status_code,
                    content_type=content_type,
                    pdf_bytes=response.content,
                    file_path=None,
                    error_message=None
                )
            return PDFResult(
                url=url,
                success=False,
                http_status=response.status_code,
                content_type=content_type,
                pdf_bytes=None,
                file_path=None,
                error_message=f"No PDF (status: {response.status_code})"
            )
        except Exception as e:
            return PDFResult(
                url=url,
                success=False,
                http_status=0,
                content_type=None,
                pdf_bytes=None,
                file_path=None,
                error_message=str(e)
            )
    
    def save_pdf(self, cnr: str, order_date: str, order_no: int, pdf_bytes: bytes) -> str:
        cnr_dir = os.path.join(self.storage_path, cnr)
        os.makedirs(cnr_dir, exist_ok=True)
        filename = f"{order_date}_order{order_no}.pdf"
        file_path = os.path.join(cnr_dir, filename)
        with open(file_path, "wb") as f:
            f.write(pdf_bytes)
        return file_path
    
    async def fetch_and_save(self, url: str, cnr: str, order_date: str, order_no: int) -> PDFResult:
        result = await self.fetch_pdf(url)
        if result.success and result.pdf_bytes:
            result.file_path = self.save_pdf(cnr, order_date, order_no, result.pdf_bytes)
        await asyncio.sleep(self.rate_limit_delay)
        return result
    
    async def close(self):
        await self.client.aclose()
```

---

# 8. PDF TEXT EXTRACTION

```python
# services/pdf_text_extractor.py

import os
from typing import Optional
from dataclasses import dataclass
import fitz  # PyMuPDF

@dataclass
class ExtractionResult:
    success: bool
    raw_text: str
    cleaned_text: str
    page_count: int
    word_count: int
    error_message: Optional[str]

class PDFTextExtractor:
    def extract_text(self, pdf_path: str) -> ExtractionResult:
        try:
            if not os.path.exists(pdf_path):
                return ExtractionResult(
                    success=False, raw_text="", cleaned_text="",
                    page_count=0, word_count=0,
                    error_message=f"File not found: {pdf_path}"
                )
            
            doc = fitz.open(pdf_path)
            page_texts = [page.get_text("text") for page in doc]
            raw_text = "\n\n".join(page_texts)
            cleaned_text = self._clean_text(raw_text)
            
            result = ExtractionResult(
                success=True,
                raw_text=raw_text,
                cleaned_text=cleaned_text,
                page_count=len(doc),
                word_count=len(cleaned_text.split()),
                error_message=None
            )
            doc.close()
            return result
        except Exception as e:
            return ExtractionResult(
                success=False, raw_text="", cleaned_text="",
                page_count=0, word_count=0, error_message=str(e)
            )
    
    def _clean_text(self, text: str) -> str:
        import re
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()
```

---

# 9. LLM CLASSIFICATION ENGINE

## 9.1 Classification Prompt

```python
CLASSIFICATION_SYSTEM_PROMPT = """You are an expert legal document classifier for Indian court orders.

CRITICAL: Identify TWO types of orders with special attention:

1. SUMMONS/NOTICE ORDERS: Orders where summons or notices are issued to parties, especially business entities.

2. FRESH CASE ASSIGNMENT ORDERS: Orders containing phrases like:
   - "fresh case received by way of assignment"
   - "case received, it be checked and registered"
   - "new case registered"
   - "case transferred and received"

Extract the following as JSON:

{
    "case_title": "Full case title",
    "case_number": "Official case number",
    "case_type": "Civil Suit, Criminal Complaint, etc.",
    "petitioner_names": ["List of petitioners"],
    "respondent_names": ["List of respondents"],
    "judge_name": "Presiding judge",
    "court_name": "Court name",
    "statutory_provisions": ["Acts/sections cited"],
    "order_type": "Summons, Notice, Assignment, etc.",
    "order_summary": "2-3 sentence summary",
    "operative_portion": "Operative part text",
    "next_hearing_date": "YYYY-MM-DD if mentioned",
    "is_summons_order": true/false,
    "is_notice_order": true/false,
    "is_fresh_case_assignment": true/false,
    "has_business_entity": true/false,
    "entity_types": ["Company", "LLP", "Partnership"],
    "identified_entities": [
        {
            "name": "Entity name",
            "type": "Company/LLP/etc.",
            "role": "Respondent/Defendant/etc."
        }
    ],
    "classification_confidence": 0.0-1.0
}

Look for business entity indicators:
- "Pvt. Ltd.", "Private Limited", "Ltd." → Company
- "LLP" → Limited Liability Partnership
- GSTIN numbers (22AAAAA0000A1Z5 format) → GST Registered

Output ONLY valid JSON."""
```

## 9.2 Classifier Service

```python
# services/classifier.py

import json
from typing import Dict, Optional, List
from dataclasses import dataclass
import anthropic

@dataclass
class IdentifiedEntity:
    name: str
    entity_type: str
    role: str

@dataclass
class ClassificationResult:
    success: bool
    case_title: Optional[str]
    case_number: Optional[str]
    case_type: Optional[str]
    petitioner_names: List[str]
    respondent_names: List[str]
    judge_name: Optional[str]
    court_name: Optional[str]
    statutory_provisions: List[str]
    order_type: Optional[str]
    order_summary: Optional[str]
    operative_portion: Optional[str]
    next_hearing_date: Optional[str]
    is_summons_order: bool
    is_notice_order: bool
    is_fresh_case_assignment: bool
    has_business_entity: bool
    entity_types: List[str]
    identified_entities: List[IdentifiedEntity]
    classification_confidence: float
    error_message: Optional[str]

class OrderClassifier:
    def __init__(self, api_key: str, model: str = "claude-3-sonnet-20240229"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
    
    def classify(self, order_text: str) -> ClassificationResult:
        try:
            # Truncate if needed
            if len(order_text) > 50000:
                order_text = order_text[:50000] + "\n[Truncated...]"
            
            message = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=CLASSIFICATION_SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Analyze this court order:\n\"\"\"\n{order_text}\n\"\"\""
                }]
            )
            
            response = message.content[0].text
            parsed = json.loads(response)
            
            entities = [
                IdentifiedEntity(
                    name=e.get("name", ""),
                    entity_type=e.get("type", ""),
                    role=e.get("role", "")
                )
                for e in parsed.get("identified_entities", [])
            ]
            
            return ClassificationResult(
                success=True,
                case_title=parsed.get("case_title"),
                case_number=parsed.get("case_number"),
                case_type=parsed.get("case_type"),
                petitioner_names=parsed.get("petitioner_names", []),
                respondent_names=parsed.get("respondent_names", []),
                judge_name=parsed.get("judge_name"),
                court_name=parsed.get("court_name"),
                statutory_provisions=parsed.get("statutory_provisions", []),
                order_type=parsed.get("order_type"),
                order_summary=parsed.get("order_summary"),
                operative_portion=parsed.get("operative_portion"),
                next_hearing_date=parsed.get("next_hearing_date"),
                is_summons_order=parsed.get("is_summons_order", False),
                is_notice_order=parsed.get("is_notice_order", False),
                is_fresh_case_assignment=parsed.get("is_fresh_case_assignment", False),
                has_business_entity=parsed.get("has_business_entity", False),
                entity_types=parsed.get("entity_types", []),
                identified_entities=entities,
                classification_confidence=parsed.get("classification_confidence", 0.5),
                error_message=None
            )
        except Exception as e:
            return ClassificationResult(
                success=False,
                case_title=None, case_number=None, case_type=None,
                petitioner_names=[], respondent_names=[],
                judge_name=None, court_name=None, statutory_provisions=[],
                order_type=None, order_summary=None, operative_portion=None,
                next_hearing_date=None,
                is_summons_order=False, is_notice_order=False,
                is_fresh_case_assignment=False, has_business_entity=False,
                entity_types=[], identified_entities=[],
                classification_confidence=0.0, error_message=str(e)
            )
```

---

# 10. BUSINESS ENTITY CONTACT ENRICHMENT

```python
# services/entity_enrichment.py

import re
from typing import Optional, Dict, List
from dataclasses import dataclass
import httpx

@dataclass
class CompanyInfo:
    name: str
    cin: Optional[str]
    gstin: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    registered_address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    company_status: Optional[str]
    directors: List[Dict]
    data_source: str

class EntityEnrichmentService:
    def __init__(self, zaubacorp_api_key: Optional[str] = None):
        self.zaubacorp_key = zaubacorp_api_key
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def enrich_by_cin(self, cin: str) -> Optional[CompanyInfo]:
        if not self._validate_cin(cin):
            return None
        
        if self.zaubacorp_key:
            return await self._fetch_from_zaubacorp(cin)
        return None
    
    async def enrich_by_name(self, company_name: str) -> Optional[CompanyInfo]:
        normalized = self._normalize_company_name(company_name)
        if self.zaubacorp_key:
            return await self._search_zaubacorp(normalized)
        return None
    
    async def _fetch_from_zaubacorp(self, cin: str) -> Optional[CompanyInfo]:
        try:
            response = await self.client.get(
                f"https://api.zaubacorp.com/v2/company/{cin}",
                headers={"Authorization": f"Bearer {self.zaubacorp_key}"}
            )
            if response.status_code != 200:
                return None
            
            data = response.json()
            directors = [
                {"name": d.get("name"), "din": d.get("din"), "email": d.get("email")}
                for d in data.get("directors", [])
            ]
            
            return CompanyInfo(
                name=data.get("company_name"),
                cin=cin,
                gstin=data.get("gstin"),
                email=data.get("email"),
                phone=data.get("phone"),
                registered_address=data.get("registered_address"),
                city=data.get("city"),
                state=data.get("state"),
                company_status=data.get("company_status"),
                directors=directors,
                data_source="zaubacorp"
            )
        except:
            return None
    
    async def _search_zaubacorp(self, company_name: str) -> Optional[CompanyInfo]:
        try:
            response = await self.client.get(
                "https://api.zaubacorp.com/v2/search",
                params={"q": company_name, "type": "company"},
                headers={"Authorization": f"Bearer {self.zaubacorp_key}"}
            )
            if response.status_code != 200:
                return None
            
            results = response.json().get("results", [])
            if results and results[0].get("cin"):
                return await self._fetch_from_zaubacorp(results[0]["cin"])
            return None
        except:
            return None
    
    def _validate_cin(self, cin: str) -> bool:
        return bool(re.match(r"^[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$", cin))
    
    def _normalize_company_name(self, name: str) -> str:
        name = re.sub(r'\s+(pvt\.?\s*)?ltd\.?$', '', name, flags=re.IGNORECASE)
        name = re.sub(r'[^\w\s]', ' ', name)
        return ' '.join(name.split()).strip()
    
    async def close(self):
        await self.client.aclose()
```

---

# 11. BACKEND API SPECIFICATION

## 11.1 API Endpoints

```
Base URL: /api/v1

DISTRICTS
GET    /districts                     - List all districts
GET    /districts/{id}                - Get district details

CNR MANAGEMENT
POST   /cnrs/generate                 - Generate CNRs for a district
GET    /cnrs                          - List CNRs with pagination
GET    /cnrs/{id}                     - Get CNR details with orders

ORDERS
GET    /orders                        - List orders with filters
GET    /orders/{id}                   - Get order details
GET    /orders/{id}/pdf               - Download order PDF

PROCESSING JOBS
POST   /jobs/check-pdfs               - Start PDF checking job
POST   /jobs/extract-texts            - Start text extraction job
POST   /jobs/classify                 - Start classification job
POST   /jobs/enrich-entities          - Start entity enrichment
GET    /jobs/{id}                     - Get job status

BUSINESS LEADS
GET    /leads                         - List business leads
GET    /leads/export                  - Export leads as CSV
GET    /leads/{id}                    - Get lead details

ANALYTICS
GET    /analytics/overview            - Dashboard overview stats
GET    /analytics/by-district         - Stats by district
GET    /analytics/trends              - Time-based trends
```

## 11.2 FastAPI Main Application

```python
# main.py

from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.config import settings
from app.database import get_db, engine, Base
from app.schemas import *
from app.services.cnr_generator import build_cnr
from app.services.url_builder import generate_order_urls
from app.services.pdf_fetcher import PDFFetcher
from app.services.pdf_text_extractor import PDFTextExtractor
from app.services.classifier import OrderClassifier
from app.services.entity_enrichment import EntityEnrichmentService
from app import crud

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Delhi Court Case Extractor",
    description="AI-powered court case extraction and business lead generation",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
pdf_fetcher = PDFFetcher(storage_path=settings.PDF_STORAGE_PATH)
text_extractor = PDFTextExtractor()
classifier = OrderClassifier(api_key=settings.LLM_API_KEY, model=settings.LLM_MODEL)
enrichment_service = EntityEnrichmentService(zaubacorp_api_key=settings.ZAUBACORP_API_KEY)

@app.get("/api/v1/districts")
async def list_districts(db: Session = Depends(get_db)):
    return crud.get_districts(db)

@app.post("/api/v1/cnrs/generate")
async def generate_cnrs_endpoint(
    request: CNRGenerationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    district = crud.get_district(db, request.district_id)
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    
    created_cnrs = []
    created_orders = []
    
    for serial in range(request.start_serial, request.end_serial + 1):
        cnr_str = build_cnr(district, serial, request.year)
        
        existing = crud.get_cnr_by_string(db, cnr_str)
        if existing:
            continue
        
        cnr_record = crud.create_cnr(
            db, district_id=district.id, cnr=cnr_str,
            serial_number=serial, year=request.year
        )
        created_cnrs.append(cnr_record)
        
        urls = generate_order_urls(
            cnr=cnr_str, base_url=district.base_url,
            days_ahead=request.days_ahead, max_order_no=request.max_order_no
        )
        
        for url_obj in urls:
            order = crud.create_cnr_order(
                db, cnr_id=cnr_record.id, order_no=url_obj.order_no,
                order_date=url_obj.order_date, url=url_obj.url,
                encoded_payload=url_obj.encoded_payload
            )
            created_orders.append(order)
    
    db.commit()
    
    return {
        "success": True,
        "cnrs_created": len(created_cnrs),
        "orders_created": len(created_orders)
    }

@app.get("/api/v1/leads")
async def list_leads(
    entity_type: Optional[str] = None,
    is_summons: Optional[bool] = None,
    is_notice: Optional[bool] = None,
    is_fresh_case: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    total, leads = crud.get_business_leads(
        db, entity_type=entity_type, is_summons=is_summons,
        is_notice=is_notice, is_fresh_case=is_fresh_case,
        skip=(page - 1) * page_size, limit=page_size
    )
    return {"total": total, "page": page, "items": leads}

@app.get("/api/v1/analytics/overview")
async def get_overview_stats(db: Session = Depends(get_db)):
    return crud.get_overview_stats(db)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

---

# 12. FRONTEND DESIGN SYSTEM

## 12.1 Design Philosophy

**Ultra-premium, luxury legal tech aesthetic:**
- Color Palette: Deep navy (#0A1628), warm gold (#C9A962), white (#FFFFFF)
- Typography: Playfair Display (headings), Source Sans Pro (body)
- Design: Clean minimalism, gold accents, generous whitespace

## 12.2 Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#E8EBF0',
          500: '#3E5780',
          800: '#1E2D47',
          900: '#0A1628',
        },
        gold: {
          100: '#F5EED8',
          500: '#C9A962',
          600: '#B8943E',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Source Sans Pro', 'sans-serif'],
      },
      boxShadow: {
        'premium-md': '0 8px 24px -4px rgba(10, 22, 40, 0.12)',
        'gold-glow': '0 0 24px -4px rgba(201, 169, 98, 0.3)',
      },
    },
  },
}
```

## 12.3 Key React Components

### Dashboard Page
```tsx
// src/pages/Dashboard.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Building2, Gavel, AlertCircle, CheckCircle } from 'lucide-react';
import MainLayout from '../components/layout/MainLayout';
import StatsCard from '../components/dashboard/StatsCard';
import { useApi } from '../hooks/useApi';

export default function Dashboard() {
  const { data: stats } = useApi('/api/v1/analytics/overview');
  
  return (
    <MainLayout>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-navy-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">Overview of case extraction and lead generation</p>
      </motion.div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard title="Total CNRs" value={stats?.total_cnrs || 0} icon={FileText} />
        <StatsCard title="PDFs Extracted" value={stats?.pdfs_found || 0} icon={FileText} />
        <StatsCard title="Business Leads" value={stats?.business_leads || 0} icon={Building2} />
        <StatsCard title="Pending" value={stats?.pending_classification || 0} icon={AlertCircle} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div className="bg-gradient-to-br from-gold-500 to-gold-600 rounded-xl p-6 text-white shadow-gold-glow">
          <Gavel className="w-8 h-8 mb-4 opacity-80" />
          <h3 className="text-4xl font-display font-semibold">{stats?.summons_today || 0}</h3>
          <p className="mt-2 text-gold-100">Summons Issued Today</p>
        </motion.div>
        
        <motion.div className="bg-gradient-to-br from-navy-800 to-navy-900 rounded-xl p-6 text-white">
          <AlertCircle className="w-8 h-8 mb-4 opacity-80" />
          <h3 className="text-4xl font-display font-semibold">{stats?.notices_today || 0}</h3>
          <p className="mt-2 text-slate-300">Notices Issued Today</p>
        </motion.div>
        
        <motion.div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <CheckCircle className="w-8 h-8 mb-4 opacity-80" />
          <h3 className="text-4xl font-display font-semibold">{stats?.fresh_cases_today || 0}</h3>
          <p className="mt-2 text-emerald-100">Fresh Cases Registered</p>
        </motion.div>
      </div>
    </MainLayout>
  );
}
```

---

# 13. COMPLETE FILE STRUCTURE

```
delhi-case-extractor/
├── .replit
├── replit.nix
├── pyproject.toml
├── package.json
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── cnr_generator.py
│   │   │   ├── url_builder.py
│   │   │   ├── pdf_fetcher.py
│   │   │   ├── pdf_text_extractor.py
│   │   │   ├── classifier.py
│   │   │   └── entity_enrichment.py
│   │   ├── crud/
│   │   └── api/
│   ├── migrations/
│   └── data/pdfs/
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── services/
│
└── scripts/
    ├── setup.sh
    └── start.sh
```

---

# 14. REPLIT CONFIGURATION

## .replit
```
run = "bash scripts/start.sh"

[nix]
channel = "stable-23_11"

[[ports]]
localPort = 8000
externalPort = 80

[[ports]]
localPort = 5173
externalPort = 3000
```

## replit.nix
```nix
{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.postgresql
    pkgs.nodejs_20
    pkgs.nodePackages.npm
  ];
}
```

## scripts/start.sh
```bash
#!/bin/bash
cd backend && pip install -r requirements.txt && python -m app.main &
cd frontend && npm install && npm run dev &
wait
```

---

# 15. ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/delhi_courts

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-sonnet-20240229
LLM_API_KEY=your_api_key

# External APIs
ZAUBACORP_API_KEY=your_key

# Storage
PDF_STORAGE_PATH=data/pdfs
```

---

# APPENDIX: District Codes Reference

| District | Code | Subdomain |
|----------|------|-----------|
| Central Delhi | DLCE | centraldelhi |
| East Delhi | DLEA | eastdelhi |
| New Delhi | DLND | newdelhi |
| North Delhi | DLNO | northdelhi |
| North East Delhi | DLNE | northeastdelhi |
| North West Delhi | DLNW | northwestdelhi |
| Shahdara | DLSH | shahdara |
| South Delhi | DLSO | southdelhi |
| South East Delhi | DLSE | southeastdelhi |
| South West Delhi | DLSW | southwestdelhi |
| West Delhi | DLWE | westdelhi |

---

# APPENDIX: Order Detection Keywords

## Summons Keywords
- "summon is hereby issued"
- "issue summons"
- "summons to accused"

## Notice Keywords
- "notice is hereby issued"
- "issue notice"
- "notice to respondent"

## Fresh Case Keywords
- "fresh case received by way of assignment"
- "case received, it be checked and registered"
- "new case registered"
- "matter listed for first hearing"

---

**END OF DOCUMENTATION**

*This documentation provides everything needed for Replit AI to build the complete Delhi Court Case Extractor application.*
