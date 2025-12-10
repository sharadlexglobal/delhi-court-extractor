# Delhi Court Case Extractor & Business Lead Generator

## Overview

This is a legal intelligence platform for extracting court case data from Delhi district courts and generating business leads. The application automates CNR (Case Number Record) discovery, PDF order extraction, and intelligent classification of legal cases to identify potential business opportunities.

The platform provides a data-intensive dashboard for managing court case records, tracking PDF downloads, and managing business entity leads extracted from court orders.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens (Carbon Design System-inspired)
- **Charts**: Recharts for analytics visualizations
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Build Tool**: Vite for frontend, esbuild for server bundling

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Tables**:
  - `districts`: Delhi court district configurations
  - `cnrs`: Case Number Records with validation status
  - `cnr_orders`: Court orders linked to CNRs with PDF tracking
  - `pdf_texts`: Extracted text content from PDFs
  - `order_metadata`: Parsed metadata from orders
  - `business_entities`: Extracted business leads
  - `entity_contacts`: Contact information for leads
  - `processing_jobs`: Background job tracking

### Delhi District Court Mappings (VERIFIED Dec 10, 2025)

CNR Format: `DL` + `code_prefix` + `establishment_code` + `serial_number(6 digits)` + `year(4 digits)`
Example: DLWT010127152025 = DL + WT + 01 + 012715 + 2025

| District | CNR Prefix | Code | Domain |
|----------|------------|------|--------|
| Central Delhi | DLCT | CT | centraldelhi.dcourts.gov.in |
| East Delhi | DLET | ET | eastdelhi.dcourts.gov.in |
| New Delhi | DLND | ND | newdelhidc.dcourts.gov.in |
| North Delhi | DLNT | NT | northdelhi.dcourts.gov.in |
| North East Delhi | DLNE | NE | northeastdelhi.dcourts.gov.in |
| North West Delhi | DLNW | NW | rohini.dcourts.gov.in |
| Shahdara | DLSH | SH | shahdara.dcourts.gov.in |
| South Delhi | DLST | ST | southdelhi.dcourts.gov.in |
| South East Delhi | DLSE | SE | southeastdelhi.dcourts.gov.in |
| South West Delhi | DLSW | SW | southwestdelhi.dcourts.gov.in |
| West Delhi | DLWT | WT | westdelhi.dcourts.gov.in |

### Key Design Decisions

1. **Monorepo Structure**: Client, server, and shared code in single repository with path aliases (`@/`, `@shared/`)

2. **Shared Schema**: Database schema and Zod validation schemas shared between frontend and backend via `shared/schema.ts`

3. **Storage Abstraction**: `server/storage.ts` provides a typed interface layer over database operations

4. **Design System**: Custom theme with IBM Plex fonts, professional navy/gold color palette, optimized for data density and legal credibility

5. **Session Storage**: Uses `connect-pg-simple` for PostgreSQL-backed sessions

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- **Drizzle Kit**: Database migrations via `drizzle-kit push`

### Third-Party Services (Bundled for Production)
The build script bundles these dependencies to reduce cold start times:
- `@google/generative-ai`: AI text processing
- `axios`: HTTP client for external requests
- `nodemailer`: Email notifications
- `openai`: AI processing capabilities
- `stripe`: Payment processing
- `xlsx`: Excel file generation for exports

### UI Dependencies
- Radix UI primitives for accessible components
- Recharts for data visualization
- Embla Carousel for carousel components
- Vaul for drawer components

### Development
- Vite dev server with HMR
- Replit-specific plugins for development experience

## API Endpoints

### CNR Generation
- `POST /api/cnrs/generate` - Generate CNRs with orders for a district

### PDF Downloads  
- `POST /api/jobs/start-pdf-download-zenrows` - Start PDF download job using ZenRows API

### Text Extraction
- `POST /api/jobs/extract-texts` - Extract text from downloaded PDFs

### Classification
- `POST /api/jobs/classify` - Classify orders using AI to identify business entities

## Verified End-to-End Test (Dec 10, 2025)

**Test Case**: DLWT010127152025 (West Delhi, serial 012715, year 2025)
- CNR Generation: ✓ Correct format DL+WT+01+012715+2025
- URL Construction: ✓ Using westdelhi.dcourts.gov.in domain
- PDF Download: ✓ 140,686 bytes via ZenRows (Dec 4 order)
- Text Extraction: ✓ 134 words extracted (Bail Matter No. 4276/2025)
- Classification: ✓ Criminal case, 95% confidence

**Previous Domain Bug Fixed**: DLWT codes were incorrectly mapped to southwestdelhi domain, causing 422 errors. Now correctly mapped to westdelhi.dcourts.gov.in.

### User Control Enhancements (Dec 10, 2025)

**CNR Generation:**
- Serial range: User specifies From/To (max 100 per request)
- Bulk duplicate checking using getCnrsByStrings()

**Order URL Generation:**
- Date range: User selects From/To dates (max 30 days)
- Order range: User selects From/To order numbers (max 10)
- Total calculation: CNRs × Days × Orders (max 1000 per request)
- Bulk CNR+District fetch using getCnrsByIdsWithDistricts()

**Server-side Limits:**
- MAX_CNRS_PER_REQUEST = 100
- MAX_DAYS_RANGE = 30
- MAX_ORDER_RANGE = 10
- MAX_ORDERS_PER_REQUEST = 1000

**Job Management:**
- Clear/Cancel button to reset job tracking
- Auto-poll job status every 2 seconds

### Enhanced Classification System (Dec 10, 2025)

**New Fields Added to `order_metadata`:**
- `statutory_act_name`: Full statutory act name with abbreviation (e.g., "MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988")
- `case_category`: Category code (MACT, NI_ACT, IPC, CPC, CrPC, POCSO, NDPS, DV_ACT, ARBITRATION, EXECUTION, MAINTENANCE, OTHER)
- `fresh_case_phrase`: Exact phrase that triggered fresh case detection

**Delhi Courts Abbreviations Reference (in classifier prompt):**
| Abbreviation | Full Name |
|--------------|-----------|
| MACT | Motor Accident Claims Tribunal (Motor Vehicles Act, 1988) |
| NI Act | Negotiable Instruments Act, 1881 (Section 138 - Cheque Bounce) |
| IPC | Indian Penal Code, 1860 |
| CPC | Code of Civil Procedure, 1908 |
| CrPC | Code of Criminal Procedure, 1973 |
| POCSO | Protection of Children from Sexual Offences Act, 2012 |
| NDPS | Narcotic Drugs and Psychotropic Substances Act, 1985 |
| SC/ST Act | Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989 |
| DV Act | Protection of Women from Domestic Violence Act, 2005 |

**Classification Output Now Includes:**
- Case title (petitioner vs respondent)
- Statutory act with full name and abbreviation
- Order summary explaining what happened
- Fresh case detection with exact phrase
- Court and judge details
- Next hearing date
- Order flags (Summons, Notice, Fresh Case, Final Order, Business Entity)

### Case Reports & Export Feature (Dec 10, 2025)

**New Categories Added:**
- COMMERCIAL_COURTS: Commercial Courts Act, 2015 (commercial disputes)

**Case Reports Page (`/case-reports`):**
- Filter cases by statutory act category (NI_ACT, COMMERCIAL_COURTS, MACT, etc.)
- View filtered list with party names, case titles, district, order date
- Export to Excel with full details (25 columns)

**New API Endpoints:**
- `GET /api/reports/case-categories` - Get count of cases per category
- `GET /api/reports/cases-by-category?categories=NI_ACT,COMMERCIAL_COURTS&limit=500` - Get filtered cases
- `GET /api/reports/export-cases?categories=NI_ACT,COMMERCIAL_COURTS` - Download Excel file

**Excel Export Columns:**
CNR Number, District, Case Category, Case Title, Case Number, Case Type, Statutory Act, Petitioner Names, Respondent Names, Petitioner Advocates, Respondent Advocates, Judge Name, Court Name, Order Date, Order Type, Order Summary, Next Hearing Date, Fresh Case, Fresh Case Phrase, Summons Order, Notice Order, Final Order, Has Business Entity, Confidence, Classified At

**Verified Test (Dec 10, 2025):**
- Order 183055 (MACT-01, West/THC/Delhi)
- statutoryActName: "MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988"
- caseCategory: "MACT"
- freshCasePhrase: "FAR received. It be checked and registered"