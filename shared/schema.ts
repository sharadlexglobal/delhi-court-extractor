import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, real, serial, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const districts = pgTable("districts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  codePrefix: varchar("code_prefix", { length: 10 }).notNull(),
  establishmentCode: varchar("establishment_code", { length: 10 }).notNull(),
  serialWidth: integer("serial_width").notNull().default(7),
  yearFormat: varchar("year_format", { length: 20 }).notNull().default("3-digit"),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cnrs = pgTable("cnrs", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  districtId: integer("district_id").notNull().references(() => districts.id),
  cnr: varchar("cnr", { length: 50 }).notNull().unique(),
  serialNumber: integer("serial_number").notNull(),
  year: integer("year").notNull(),
  isValid: boolean("is_valid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at"),
}, (table) => [
  index("idx_cnrs_district").on(table.districtId),
  index("idx_cnrs_year").on(table.year),
]);

export const cnrOrders = pgTable("cnr_orders", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  cnrId: integer("cnr_id").notNull().references(() => cnrs.id, { onDelete: "cascade" }),
  orderNo: integer("order_no").notNull(),
  orderDate: date("order_date").notNull(),
  url: text("url").notNull(),
  encodedPayload: text("encoded_payload").notNull(),
  pdfExists: boolean("pdf_exists").notNull().default(false),
  pdfPath: text("pdf_path"),
  pdfSizeBytes: integer("pdf_size_bytes"),
  httpStatusCode: integer("http_status_code"),
  retryCount: integer("retry_count").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_orders_pdf_exists").on(table.pdfExists),
  uniqueIndex("uq_cnr_order_date").on(table.cnrId, table.orderNo, table.orderDate),
]);

export const pdfTexts = pgTable("pdf_texts", {
  id: serial("id").primaryKey(),
  cnrOrderId: integer("cnr_order_id").notNull().references(() => cnrOrders.id, { onDelete: "cascade" }).unique(),
  rawText: text("raw_text").notNull(),
  cleanedText: text("cleaned_text"),
  pageCount: integer("page_count"),
  wordCount: integer("word_count"),
  extractedAt: timestamp("extracted_at").notNull().defaultNow(),
});

export const orderMetadata = pgTable("order_metadata", {
  id: serial("id").primaryKey(),
  cnrOrderId: integer("cnr_order_id").notNull().references(() => cnrOrders.id, { onDelete: "cascade" }).unique(),
  caseTitle: text("case_title"),
  caseNumber: varchar("case_number", { length: 100 }),
  caseType: varchar("case_type", { length: 100 }),
  filingDate: date("filing_date"),
  petitionerNames: text("petitioner_names"),
  respondentNames: text("respondent_names"),
  petitionerAdvocates: text("petitioner_advocates"),
  respondentAdvocates: text("respondent_advocates"),
  judgeName: varchar("judge_name", { length: 200 }),
  courtName: varchar("court_name", { length: 200 }),
  courtDesignation: varchar("court_designation", { length: 100 }),
  statutoryProvisions: text("statutory_provisions"),
  statutoryActName: text("statutory_act_name"),
  caseCategory: varchar("case_category", { length: 100 }),
  orderType: varchar("order_type", { length: 100 }),
  orderSummary: text("order_summary"),
  freshCasePhrase: text("fresh_case_phrase"),
  operativePortion: text("operative_portion"),
  nextHearingDate: date("next_hearing_date"),
  isSummonsOrder: boolean("is_summons_order").notNull().default(false),
  isNoticeOrder: boolean("is_notice_order").notNull().default(false),
  isFreshCaseAssignment: boolean("is_fresh_case_assignment").notNull().default(false),
  isFirstHearing: boolean("is_first_hearing").notNull().default(false),
  isFinalOrder: boolean("is_final_order").notNull().default(false),
  hasBusinessEntity: boolean("has_business_entity").notNull().default(false),
  entityTypes: text("entity_types"),
  classificationConfidence: real("classification_confidence"),
  llmModelUsed: varchar("llm_model_used", { length: 100 }),
  classifiedAt: timestamp("classified_at").notNull().defaultNow(),
}, (table) => [
  index("idx_metadata_summons").on(table.isSummonsOrder),
  index("idx_metadata_fresh_case").on(table.isFreshCaseAssignment),
  index("idx_metadata_business").on(table.hasBusinessEntity),
]);

export const businessEntities = pgTable("business_entities", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 500 }).notNull(),
  nameNormalized: varchar("name_normalized", { length: 500 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  cin: varchar("cin", { length: 50 }),
  llpin: varchar("llpin", { length: 50 }),
  gstin: varchar("gstin", { length: 50 }),
  pan: varchar("pan", { length: 20 }),
  registeredAddress: text("registered_address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  pincode: varchar("pincode", { length: 10 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 500 }),
  companyStatus: varchar("company_status", { length: 100 }),
  dataSource: varchar("data_source", { length: 100 }),
  enrichmentStatus: varchar("enrichment_status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_entities_name").on(table.nameNormalized),
  index("idx_entities_cin").on(table.cin),
]);

export const entityContacts = pgTable("entity_contacts", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  contactType: varchar("contact_type", { length: 50 }).notNull(),
  name: varchar("name", { length: 300 }),
  designation: varchar("designation", { length: 200 }),
  din: varchar("din", { length: 20 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const caseEntityLinks = pgTable("case_entity_links", {
  id: serial("id").primaryKey(),
  cnrOrderId: integer("cnr_order_id").notNull().references(() => cnrOrders.id, { onDelete: "cascade" }),
  entityId: integer("entity_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  partyRole: varchar("party_role", { length: 50 }).notNull(),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_case_entity").on(table.cnrOrderId, table.entityId),
]);

export const personLeads = pgTable("person_leads", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  cnrOrderId: integer("cnr_order_id").notNull().references(() => cnrOrders.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 500 }).notNull(),
  nameNormalized: varchar("name_normalized", { length: 500 }).notNull(),
  partyRole: varchar("party_role", { length: 50 }).notNull(),
  caseType: varchar("case_type", { length: 100 }),
  caseNumber: varchar("case_number", { length: 100 }),
  petitionerName: text("petitioner_name"),
  isFreshCase: boolean("is_fresh_case").notNull().default(false),
  freshCasePhrase: text("fresh_case_phrase"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  nextHearingDate: date("next_hearing_date"),
  courtName: varchar("court_name", { length: 200 }),
  judgeName: varchar("judge_name", { length: 200 }),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_person_leads_name").on(table.nameNormalized),
  index("idx_person_leads_fresh_case").on(table.isFreshCase),
  index("idx_person_leads_order").on(table.cnrOrderId),
]);

export const processingJobs = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  successfulItems: integer("successful_items").notNull().default(0),
  failedItems: integer("failed_items").notNull().default(0),
  parameters: text("parameters"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const districtsRelations = relations(districts, ({ many }) => ({
  cnrs: many(cnrs),
}));

export const cnrsRelations = relations(cnrs, ({ one, many }) => ({
  district: one(districts, {
    fields: [cnrs.districtId],
    references: [districts.id],
  }),
  orders: many(cnrOrders),
}));

export const cnrOrdersRelations = relations(cnrOrders, ({ one, many }) => ({
  cnr: one(cnrs, {
    fields: [cnrOrders.cnrId],
    references: [cnrs.id],
  }),
  pdfText: one(pdfTexts),
  metadata: one(orderMetadata),
  entityLinks: many(caseEntityLinks),
}));

export const pdfTextsRelations = relations(pdfTexts, ({ one }) => ({
  cnrOrder: one(cnrOrders, {
    fields: [pdfTexts.cnrOrderId],
    references: [cnrOrders.id],
  }),
}));

export const orderMetadataRelations = relations(orderMetadata, ({ one }) => ({
  cnrOrder: one(cnrOrders, {
    fields: [orderMetadata.cnrOrderId],
    references: [cnrOrders.id],
  }),
}));

export const businessEntitiesRelations = relations(businessEntities, ({ many }) => ({
  contacts: many(entityContacts),
  caseLinks: many(caseEntityLinks),
}));

export const entityContactsRelations = relations(entityContacts, ({ one }) => ({
  entity: one(businessEntities, {
    fields: [entityContacts.entityId],
    references: [businessEntities.id],
  }),
}));

export const caseEntityLinksRelations = relations(caseEntityLinks, ({ one }) => ({
  cnrOrder: one(cnrOrders, {
    fields: [caseEntityLinks.cnrOrderId],
    references: [cnrOrders.id],
  }),
  entity: one(businessEntities, {
    fields: [caseEntityLinks.entityId],
    references: [businessEntities.id],
  }),
}));

export const personLeadsRelations = relations(personLeads, ({ one }) => ({
  cnrOrder: one(cnrOrders, {
    fields: [personLeads.cnrOrderId],
    references: [cnrOrders.id],
  }),
}));

export const insertDistrictSchema = createInsertSchema(districts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCnrSchema = createInsertSchema(cnrs).omit({ id: true, uuid: true, createdAt: true });
export const insertCnrOrderSchema = createInsertSchema(cnrOrders).omit({ id: true, uuid: true, createdAt: true });
export const insertPdfTextSchema = createInsertSchema(pdfTexts).omit({ id: true, extractedAt: true });
export const insertOrderMetadataSchema = createInsertSchema(orderMetadata).omit({ id: true, classifiedAt: true });
export const insertBusinessEntitySchema = createInsertSchema(businessEntities).omit({ id: true, uuid: true, createdAt: true, updatedAt: true });
export const insertEntityContactSchema = createInsertSchema(entityContacts).omit({ id: true, createdAt: true });
export const insertCaseEntityLinkSchema = createInsertSchema(caseEntityLinks).omit({ id: true, createdAt: true });
export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({ id: true, uuid: true, createdAt: true });
export const insertPersonLeadSchema = createInsertSchema(personLeads).omit({ id: true, uuid: true, createdAt: true });

export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type InsertCnr = z.infer<typeof insertCnrSchema>;
export type InsertCnrOrder = z.infer<typeof insertCnrOrderSchema>;
export type InsertPdfText = z.infer<typeof insertPdfTextSchema>;
export type InsertOrderMetadata = z.infer<typeof insertOrderMetadataSchema>;
export type InsertBusinessEntity = z.infer<typeof insertBusinessEntitySchema>;
export type InsertEntityContact = z.infer<typeof insertEntityContactSchema>;
export type InsertCaseEntityLink = z.infer<typeof insertCaseEntityLinkSchema>;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
export type InsertPersonLead = z.infer<typeof insertPersonLeadSchema>;

export type District = typeof districts.$inferSelect;
export type Cnr = typeof cnrs.$inferSelect;
export type CnrOrder = typeof cnrOrders.$inferSelect;
export type PdfText = typeof pdfTexts.$inferSelect;
export type OrderMetadata = typeof orderMetadata.$inferSelect;
export type BusinessEntity = typeof businessEntities.$inferSelect;
export type EntityContact = typeof entityContacts.$inferSelect;
export type CaseEntityLink = typeof caseEntityLinks.$inferSelect;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type PersonLead = typeof personLeads.$inferSelect;

// ============================================================================
// DIRECT CNR MANAGEMENT SYSTEM - NEW ISOLATED TABLES
// These tables are completely separate from the bulk CNR workflow above.
// Used for single-CNR case management with eCourts integration.
// ============================================================================

// Advocate profiles for case management
export const directCnrAdvocates = pgTable("direct_cnr_advocates", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 300 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  barCouncilId: varchar("bar_council_id", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Managed cases - main table for Direct CNR workflow
export const directCnrCases = pgTable("direct_cnr_cases", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  advocateId: integer("advocate_id").references(() => directCnrAdvocates.id),
  cnr: varchar("cnr", { length: 50 }).notNull().unique(),
  districtId: integer("district_id").notNull().references(() => districts.id),
  
  // Case details from eCourts extraction
  caseType: varchar("case_type", { length: 100 }),
  filingNumber: varchar("filing_number", { length: 100 }),
  filingDate: date("filing_date"),
  registrationNumber: varchar("registration_number", { length: 100 }),
  registrationDate: date("registration_date"),
  
  // Party representation perspective (for AI analysis)
  representedParty: varchar("represented_party", { length: 20 }), // 'petitioner' | 'respondent' | null
  perspectiveSetAt: timestamp("perspective_set_at"),
  
  // Parties
  petitionerName: text("petitioner_name"),
  petitionerAdvocate: text("petitioner_advocate"),
  respondentName: text("respondent_name"),
  respondentAdvocate: text("respondent_advocate"),
  
  // Case status
  firstHearingDate: date("first_hearing_date"),
  nextHearingDate: date("next_hearing_date"),
  caseStage: varchar("case_stage", { length: 200 }),
  courtName: varchar("court_name", { length: 300 }),
  judgeName: varchar("judge_name", { length: 300 }),
  
  // Processing flags
  caseDetailsExtracted: boolean("case_details_extracted").notNull().default(false),
  initialOrdersDownloaded: boolean("initial_orders_downloaded").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  
  // Timestamps
  lastEcourtsSync: timestamp("last_ecourts_sync"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_direct_cnr_cases_advocate").on(table.advocateId),
  index("idx_direct_cnr_cases_district").on(table.districtId),
  index("idx_direct_cnr_cases_next_hearing").on(table.nextHearingDate),
]);

// Orders for managed cases
export const directCnrOrders = pgTable("direct_cnr_orders", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  caseId: integer("case_id").notNull().references(() => directCnrCases.id, { onDelete: "cascade" }),
  orderNo: integer("order_no").notNull(),
  orderDate: date("order_date").notNull(),
  hearingDate: date("hearing_date"),
  url: text("url").notNull(),
  encodedPayload: text("encoded_payload").notNull(),
  
  // PDF status
  pdfExists: boolean("pdf_exists").notNull().default(false),
  pdfPath: text("pdf_path"),
  pdfSizeBytes: integer("pdf_size_bytes"),
  httpStatusCode: integer("http_status_code"),
  
  // Processing status
  textExtracted: boolean("text_extracted").notNull().default(false),
  classificationDone: boolean("classification_done").notNull().default(false),
  summaryGenerated: boolean("summary_generated").notNull().default(false),
  
  // Retry tracking
  retryCount: integer("retry_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  errorMessage: text("error_message"),
  
  // Discovery source
  discoveredFrom: varchar("discovered_from", { length: 50 }).default("initial_sync"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_direct_cnr_orders_case").on(table.caseId),
  index("idx_direct_cnr_orders_pdf").on(table.pdfExists),
  uniqueIndex("uq_direct_cnr_order").on(table.caseId, table.orderNo, table.orderDate),
]);

// Extracted text from PDFs
export const directCnrPdfTexts = pgTable("direct_cnr_pdf_texts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => directCnrOrders.id, { onDelete: "cascade" }).unique(),
  rawText: text("raw_text").notNull(),
  cleanedText: text("cleaned_text"),
  pageCount: integer("page_count"),
  wordCount: integer("word_count"),
  extractedAt: timestamp("extracted_at").notNull().defaultNow(),
});

// Order summaries with advocate preparation guidance
export const directCnrSummaries = pgTable("direct_cnr_summaries", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => directCnrOrders.id, { onDelete: "cascade" }).unique(),
  
  // Case classification
  caseTitle: text("case_title"),
  caseCategory: varchar("case_category", { length: 100 }),
  statutoryActName: text("statutory_act_name"),
  orderType: varchar("order_type", { length: 100 }),
  orderSummary: text("order_summary"),
  operativePortion: text("operative_portion"),
  nextHearingDate: date("next_hearing_date"),
  
  // Order flags
  isFinalOrder: boolean("is_final_order").notNull().default(false),
  isSummonsOrder: boolean("is_summons_order").notNull().default(false),
  isNoticeOrder: boolean("is_notice_order").notNull().default(false),
  
  // Advocate guidance (unique to Direct CNR)
  preparationNotes: text("preparation_notes"),
  actionItems: text("action_items"), // JSON array stored as text
  
  // Confidence
  classificationConfidence: real("classification_confidence"),
  llmModelUsed: varchar("llm_model_used", { length: 100 }),
  classifiedAt: timestamp("classified_at").notNull().defaultNow(),
});

// Monitoring schedule for new orders (30-day check cycle)
export const directCnrMonitoring = pgTable("direct_cnr_monitoring", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => directCnrCases.id, { onDelete: "cascade" }),
  triggerDate: date("trigger_date").notNull(), // Hearing date that triggers monitoring
  startMonitoringDate: date("start_monitoring_date").notNull(),
  endMonitoringDate: date("end_monitoring_date").notNull(),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  orderFound: boolean("order_found").notNull().default(false),
  foundOrderId: integer("found_order_id").references(() => directCnrOrders.id),
  
  // Tracking
  totalChecks: integer("total_checks").notNull().default(0),
  lastCheckAt: timestamp("last_check_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_direct_cnr_monitoring_case").on(table.caseId),
  index("idx_direct_cnr_monitoring_active").on(table.isActive),
  index("idx_direct_cnr_monitoring_dates").on(table.startMonitoringDate, table.endMonitoringDate),
]);

// Master case rollups (aggregated summaries of all orders)
export const directCnrCaseRollups = pgTable("direct_cnr_case_rollups", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => directCnrCases.id, { onDelete: "cascade" }).unique(),
  
  // Timeline and progression summary
  caseProgressionSummary: text("case_progression_summary"),
  timelineJson: text("timeline_json"), // JSON array of { date, event, party, details }
  
  // Adjournment analytics
  petitionerAdjournments: integer("petitioner_adjournments").default(0),
  respondentAdjournments: integer("respondent_adjournments").default(0),
  courtAdjournments: integer("court_adjournments").default(0), // judge leave/training
  adjournmentDetails: text("adjournment_details"), // JSON array with reasons
  
  // Bird's eye view for advocate
  advocateBirdEyeView: text("advocate_bird_eye_view"),
  keyMilestones: text("key_milestones"), // JSON array
  
  // Current status
  currentStage: varchar("current_stage", { length: 100 }),
  pendingActions: text("pending_actions"), // JSON array
  
  // Compilation metadata
  ordersIncluded: integer("orders_included").default(0),
  lastCompiledAt: timestamp("last_compiled_at").notNull().defaultNow(),
  compilationModel: varchar("compilation_model", { length: 100 }),
});

// Business leads extracted from cases
export const directCnrBusinessLeads = pgTable("direct_cnr_business_leads", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 36 }).notNull().unique().default(sql`gen_random_uuid()`),
  caseId: integer("case_id").notNull().references(() => directCnrCases.id, { onDelete: "cascade" }),
  
  // Entity details
  rawName: text("raw_name").notNull(), // Original name from court records
  normalizedName: varchar("normalized_name", { length: 500 }),
  entityType: varchar("entity_type", { length: 100 }), // pvt_ltd, llp, partnership, proprietorship, trust, society, etc.
  partyRole: varchar("party_role", { length: 50 }), // petitioner, respondent
  
  // Classification details
  businessIndicators: text("business_indicators"), // JSON array of indicators found
  classificationConfidence: real("classification_confidence"),
  isConfirmedBusiness: boolean("is_confirmed_business").notNull().default(false),
  
  // Enrichment data
  indiamartSearchQuery: text("indiamart_search_query"),
  indiamartProfileUrl: text("indiamart_profile_url"),
  indiamartSearchResults: text("indiamart_search_results"), // JSON array
  
  // MCA/Company data
  cin: varchar("cin", { length: 50 }),
  gstin: varchar("gstin", { length: 50 }),
  pan: varchar("pan", { length: 20 }),
  registeredAddress: text("registered_address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  phone: varchar("phone", { length: 100 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 500 }),
  
  // Enrichment status
  enrichmentStatus: varchar("enrichment_status", { length: 50 }).default("pending"), // pending, searching, enriched, failed
  enrichedAt: timestamp("enriched_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_direct_cnr_leads_case").on(table.caseId),
  index("idx_direct_cnr_leads_status").on(table.enrichmentStatus),
  index("idx_direct_cnr_leads_confirmed").on(table.isConfirmedBusiness),
]);

// Daily digest email tracking
export const directCnrDailyDigests = pgTable("direct_cnr_daily_digests", {
  id: serial("id").primaryKey(),
  runDate: date("run_date").notNull(),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  
  // Digest content
  casesIncluded: integer("cases_included").notNull().default(0),
  digestPayload: text("digest_payload"), // JSON with case summaries
  
  // Status
  sentAt: timestamp("sent_at"),
  deliveryStatus: varchar("delivery_status", { length: 50 }).default("pending"), // pending, sent, failed
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_daily_digest_date").on(table.runDate),
  uniqueIndex("uq_daily_digest").on(table.runDate, table.recipientEmail),
]);

// ============================================================================
// DIRECT CNR RELATIONS
// ============================================================================

export const directCnrAdvocatesRelations = relations(directCnrAdvocates, ({ many }) => ({
  cases: many(directCnrCases),
}));

export const directCnrCasesRelations = relations(directCnrCases, ({ one, many }) => ({
  advocate: one(directCnrAdvocates, {
    fields: [directCnrCases.advocateId],
    references: [directCnrAdvocates.id],
  }),
  district: one(districts, {
    fields: [directCnrCases.districtId],
    references: [districts.id],
  }),
  orders: many(directCnrOrders),
  monitoringSchedules: many(directCnrMonitoring),
  rollup: one(directCnrCaseRollups),
}));

export const directCnrCaseRollupsRelations = relations(directCnrCaseRollups, ({ one }) => ({
  case: one(directCnrCases, {
    fields: [directCnrCaseRollups.caseId],
    references: [directCnrCases.id],
  }),
}));

export const directCnrOrdersRelations = relations(directCnrOrders, ({ one }) => ({
  case: one(directCnrCases, {
    fields: [directCnrOrders.caseId],
    references: [directCnrCases.id],
  }),
  pdfText: one(directCnrPdfTexts),
  summary: one(directCnrSummaries),
}));

export const directCnrPdfTextsRelations = relations(directCnrPdfTexts, ({ one }) => ({
  order: one(directCnrOrders, {
    fields: [directCnrPdfTexts.orderId],
    references: [directCnrOrders.id],
  }),
}));

export const directCnrSummariesRelations = relations(directCnrSummaries, ({ one }) => ({
  order: one(directCnrOrders, {
    fields: [directCnrSummaries.orderId],
    references: [directCnrOrders.id],
  }),
}));

export const directCnrMonitoringRelations = relations(directCnrMonitoring, ({ one }) => ({
  case: one(directCnrCases, {
    fields: [directCnrMonitoring.caseId],
    references: [directCnrCases.id],
  }),
  foundOrder: one(directCnrOrders, {
    fields: [directCnrMonitoring.foundOrderId],
    references: [directCnrOrders.id],
  }),
}));

// ============================================================================
// DIRECT CNR INSERT SCHEMAS & TYPES
// ============================================================================

export const insertDirectCnrAdvocateSchema = createInsertSchema(directCnrAdvocates).omit({ 
  id: true, uuid: true, createdAt: true, updatedAt: true 
});
export const insertDirectCnrCaseSchema = createInsertSchema(directCnrCases).omit({ 
  id: true, uuid: true, createdAt: true, updatedAt: true 
});
export const insertDirectCnrOrderSchema = createInsertSchema(directCnrOrders).omit({ 
  id: true, uuid: true, createdAt: true, updatedAt: true 
});
export const insertDirectCnrPdfTextSchema = createInsertSchema(directCnrPdfTexts).omit({ 
  id: true, extractedAt: true 
});
export const insertDirectCnrSummarySchema = createInsertSchema(directCnrSummaries).omit({ 
  id: true, classifiedAt: true 
});
export const insertDirectCnrMonitoringSchema = createInsertSchema(directCnrMonitoring).omit({ 
  id: true, createdAt: true 
});
export const insertDirectCnrCaseRollupSchema = createInsertSchema(directCnrCaseRollups).omit({ 
  id: true, lastCompiledAt: true 
});
export const insertDirectCnrDailyDigestSchema = createInsertSchema(directCnrDailyDigests).omit({ 
  id: true, createdAt: true 
});
export const insertDirectCnrBusinessLeadSchema = createInsertSchema(directCnrBusinessLeads).omit({ 
  id: true, uuid: true, createdAt: true, updatedAt: true 
});

export type InsertDirectCnrAdvocate = z.infer<typeof insertDirectCnrAdvocateSchema>;
export type InsertDirectCnrCase = z.infer<typeof insertDirectCnrCaseSchema>;
export type InsertDirectCnrOrder = z.infer<typeof insertDirectCnrOrderSchema>;
export type InsertDirectCnrPdfText = z.infer<typeof insertDirectCnrPdfTextSchema>;
export type InsertDirectCnrSummary = z.infer<typeof insertDirectCnrSummarySchema>;
export type InsertDirectCnrMonitoring = z.infer<typeof insertDirectCnrMonitoringSchema>;
export type InsertDirectCnrCaseRollup = z.infer<typeof insertDirectCnrCaseRollupSchema>;
export type InsertDirectCnrDailyDigest = z.infer<typeof insertDirectCnrDailyDigestSchema>;
export type InsertDirectCnrBusinessLead = z.infer<typeof insertDirectCnrBusinessLeadSchema>;

export type DirectCnrAdvocate = typeof directCnrAdvocates.$inferSelect;
export type DirectCnrCase = typeof directCnrCases.$inferSelect;
export type DirectCnrOrder = typeof directCnrOrders.$inferSelect;
export type DirectCnrPdfText = typeof directCnrPdfTexts.$inferSelect;
export type DirectCnrSummary = typeof directCnrSummaries.$inferSelect;
export type DirectCnrMonitoring = typeof directCnrMonitoring.$inferSelect;
export type DirectCnrCaseRollup = typeof directCnrCaseRollups.$inferSelect;
export type DirectCnrDailyDigest = typeof directCnrDailyDigests.$inferSelect;
export type DirectCnrBusinessLead = typeof directCnrBusinessLeads.$inferSelect;

// ============================================================================
// END OF DIRECT CNR TABLES
// ============================================================================

export const cnrGenerationRequestSchema = z.object({
  districtId: z.number().int().positive(),
  startSerial: z.number().int().positive(),
  endSerial: z.number().int().positive(),
  year: z.number().int().min(2000).max(2030),
  daysAhead: z.number().int().min(1).max(60).default(30),
  maxOrderNo: z.number().int().min(1).max(20).default(10),
  startDate: z.string().optional(),
});

export type CnrGenerationRequest = z.infer<typeof cnrGenerationRequestSchema>;
