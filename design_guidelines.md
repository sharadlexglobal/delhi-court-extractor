# Design Guidelines: Delhi Court Case Extractor & Business Lead Generator

## Design Approach

**Selected Approach**: Design System (Carbon Design System-inspired)
**Rationale**: This is a data-intensive legal intelligence platform requiring information density, clear hierarchy, and professional credibility. Carbon Design's enterprise-focused patterns are ideal for legal/business intelligence applications.

---

## Core Design Principles

1. **Professional Authority**: Design must convey trustworthiness and legal gravitas
2. **Information Density**: Maximize data visibility without overwhelming users
3. **Scanning Efficiency**: Enable rapid data scanning and pattern recognition
4. **Action Clarity**: Make lead generation and export actions immediately obvious

---

## Typography System

**Primary Font**: IBM Plex Sans (via Google Fonts CDN)
**Monospace Font**: IBM Plex Mono (for CNR numbers, case IDs, dates)

**Hierarchy**:
- Page Titles: 2xl, font-semibold (Dashboard headings)
- Section Headers: xl, font-semibold (Card titles, panel headers)
- Data Labels: sm, font-medium, uppercase tracking-wide (Table headers, metadata labels)
- Body Text: base, font-normal (Case summaries, descriptions)
- Data Values: base, font-mono (CNR numbers, dates, case numbers)
- Captions: xs, font-normal (Timestamps, helper text)

---

## Layout System

**Spacing Units**: Tailwind units of 1, 2, 4, 6, 8, 12, 16
- Micro spacing (within components): 1-2
- Component padding: 4-6
- Section gaps: 8-12
- Page margins: 12-16

**Grid Structure**:
- Dashboard: 12-column grid with 4-unit gaps
- Sidebar: Fixed 64 units width (collapsed) / 256 units (expanded)
- Main content: Full-width with max-w-screen-2xl container

---

## Component Library

### Navigation & Layout

**Top Bar**:
- Full-width sticky header with app logo, global search, and user actions
- Height: 16 units
- Contains: App title, breadcrumb navigation, date range selector, export button

**Sidebar Navigation**:
- Collapsible side navigation with icon-only and expanded states
- Sections: Dashboard, CNR Generator, Orders, Leads, Analytics, Settings
- Active state with left border indicator

### Data Display Components

**Statistics Cards**:
- Grid of 4 cards showing: Total CNRs Generated, PDFs Downloaded, Orders Classified, Business Leads Identified
- Large numbers with trend indicators
- Compact layout with icon, label, and value

**Data Tables**:
- Dense tables with alternating row backgrounds
- Sortable columns with header indicators
- Row actions (view, export, flag) on hover
- Pagination with items-per-page selector
- Filter chips above table showing active filters

**Case Detail Cards**:
- Expandable cards showing: CNR, Case Title, Court, Judge, Parties, Filing Date
- Metadata displayed in two-column layout
- Action buttons for: View PDF, Download, Mark as Lead, Add Note

**Entity/Lead Cards**:
- Company name as header with entity type badge
- Contact details in structured list (email, phone, address, directors)
- Status indicators (Contacted, Qualified, Not Interested)
- CTA button: "Enrich Contact Data"

### Input Components

**CNR Generator Panel**:
- Three-column form: District dropdown, Serial Number Range (From-To inputs), Year input
- Advanced options collapsible section (Date range, Order number range)
- Generate button (primary action)
- Progress indicator during batch generation

**Search & Filter Bar**:
- Global search input with autocomplete
- Filter dropdown menus for: District, Date Range, Order Type, Entity Type, Status
- Applied filters shown as dismissible chips
- Clear All button

**Date Range Picker**:
- Dual calendar view for start/end dates
- Quick presets: Today, Last 7 Days, Last 30 Days, This Month
- Time zone indicator (Asia/Kolkata)

### Feedback & Status

**Loading States**:
- Skeleton screens for table rows and cards
- Progress bars for batch operations (CNR generation, PDF downloads)
- Spinner for single-item actions

**Toast Notifications**:
- Success: PDF downloaded, Order classified, Lead created
- Warning: Some PDFs not found, API rate limit approaching
- Error: Classification failed, Network error

**Empty States**:
- Centered illustrations with action prompts
- "No orders found - Generate CNRs to begin" with CTA button
- "No leads yet - Orders are being classified" with progress indicator

### Data Visualization

**Analytics Dashboard Charts**:
- Bar chart: Orders by District (horizontal bars)
- Line chart: Daily PDF Downloads over time
- Pie chart: Order Type Distribution
- Heatmap: Cases by Court and Day of Week

Chart styling: Minimal grid lines, axis labels, tooltip on hover

---

## Page Layouts

### Dashboard Page
- Top stats cards in 4-column grid
- Recent Orders table (10 rows, paginated)
- Quick Actions panel (Generate CNRs, View Pending, Export Leads)
- Activity Feed sidebar showing recent classifications and leads

### CNR Generator Page
- Prominent generation form in left panel (40% width)
- Live results table in right panel (60% width) showing generated CNRs with status badges
- Batch progress bar at top when generation active

### Orders Library Page
- Full-width searchable, filterable table
- Left sidebar with filter facets (District, Court, Judge, Date, Status)
- Order detail modal on row click with tabbed sections: Summary, Full Text, Entities, History

### Leads Management Page
- Kanban-style board with columns: New, Contacted, Qualified, Won, Lost
- Draggable lead cards
- Bulk actions toolbar
- Export to CSV button

### Analytics Page
- Grid of 6 visualization cards
- Date range selector at top
- Drilldown capability (click chart to filter)

---

## Animations

**Minimal, functional animations only**:
- Sidebar collapse/expand: 200ms ease
- Modal/dropdown entry: 150ms ease-out, subtle scale (0.95 → 1)
- Table row hover: Instant background transition
- Loading spinners: Continuous rotation
- Toast notifications: Slide in from top-right

**No decorative animations**: No parallax, no scroll-triggered effects, no complex transitions

---

## Images

**No hero images**: This is a data tool, not a marketing site

**Icons only**:
- Lucide React icon set via npm
- Icons for: Districts (Building2), Orders (FileText), Leads (Briefcase), Stats (TrendingUp), Actions (Download, Eye, Flag)

**Entity logos** (future enhancement placeholder):
- Small company logos next to business entity names if available via API
- Fallback to initials in circular avatar

---

## Responsive Behavior

**Desktop-first approach** (this is primarily a desktop tool):
- Breakpoints: lg (1024px), xl (1280px), 2xl (1536px)
- Below 1024px: Stack sidebar over content with hamburger toggle
- Tables: Horizontal scroll on tablet/mobile with sticky first column
- Charts: Reduce height and simplify on smaller screens

---

## Accessibility

- All interactive elements have focus visible states with 2-unit offset ring
- Form labels always visible (no placeholder-only inputs)
- ARIA labels on icon-only buttons
- Keyboard navigation for all actions (Tab, Enter, Escape)
- Sufficient contrast ratios (WCAG AA minimum)

---

This design creates a powerful, information-dense legal intelligence platform that prioritizes data clarity, professional credibility, and efficient workflows for legal research and lead generation.