# Delhi Court Case Extractor & Business Lead Generator

## Overview
This project is a legal intelligence platform designed to extract court case data from Delhi district courts and generate business leads. It automates the discovery of Case Number Records (CNRs), extracts information from PDF court orders, and intelligently classifies legal cases to identify potential business opportunities. The platform includes a data-intensive dashboard for managing court records, tracking PDF downloads, and managing extracted business leads.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with Carbon Design System-inspired tokens
- **Charts**: Recharts
- **Form Handling**: React Hook Form with Zod validation

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON API (`/api/*` routes)
- **Build Tool**: Vite (frontend), esbuild (server)

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: `shared/schema.ts`
- **Key Tables**: `districts`, `cnrs`, `cnr_orders`, `pdf_texts`, `order_metadata`, `business_entities`, `entity_contacts`, `processing_jobs`.
- **Direct CNR Workflow Tables**: `direct_cnr_advocates`, `direct_cnr_cases`, `direct_cnr_orders`, `direct_cnr_summaries`, `direct_cnr_monitoring`.

### Key Design Decisions
- **Monorepo Structure**: Client, server, and shared code in a single repository.
- **Shared Schema**: Database and Zod validation schemas shared.
- **Storage Abstraction**: Typed interface for database operations.
- **Design System**: Custom theme with IBM Plex fonts, navy/gold palette for data density and legal credibility.
- **Session Storage**: PostgreSQL-backed sessions using `connect-pg-simple`.
- **Classification System**: Enhanced AI classification for detailed case metadata extraction (e.g., `statutory_act_name`, `case_category`, `fresh_case_phrase`).
- **Direct CNR Workflow**: Isolated namespace for managing individual cases, including eCourts scraping, PDF processing, AI classification, advocate assignment, and a 30-day monitoring scheduler.
- **Monitoring Scheduler Logic**: Automates re-checking eCourts for new orders post-hearing date and creates new monitoring schedules if updates are found. Includes duplicate prevention.
- **eCourts Extractor**: Playwright-based scraper with GPT-4o CAPTCHA solving, extracting comprehensive case details, party information, and interim orders.
- **PDF Processing Flow**: Involves ZenRows for PDF download, Replit Object Storage, Mistral OCR for text extraction (handles scanned PDFs), and GPT-4o for classification and summary generation.

### Delhi District Court Mappings
Defines CNR prefixes, codes, and domains for Delhi's district courts to correctly identify and access court records.

### Server-side Limits
- `MAX_CNRS_PER_REQUEST = 100`
- `MAX_DAYS_RANGE = 30`
- `MAX_ORDER_RANGE = 10`
- `MAX_ORDERS_PER_REQUEST = 1000`

### Rate Limiting
- General API: 60 requests/minute
- Heavy operations (eCourts, PDF download): 5 requests/minute

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle Kit**: For database migrations.

### Third-Party Services (Bundled for Production)
- `@google/generative-ai`: AI text processing.
- `axios`: HTTP client.
- `nodemailer`: Email notifications.
- `openai`: AI processing.
- `stripe`: Payment processing.
- `xlsx`: Excel file generation for exports.
- **ZenRows API**: For robust PDF downloading, including premium proxies and JS rendering.

### UI Dependencies
- **Radix UI**: Primitives for accessible UI components.
- **Recharts**: For data visualizations.
- **Embla Carousel**: For carousel components.
- **Vaul**: For drawer components.

### Development
- **Vite**: Development server.
- **Replit-specific plugins**: For enhanced development experience.