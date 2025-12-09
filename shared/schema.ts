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
  orderType: varchar("order_type", { length: 100 }),
  orderSummary: text("order_summary"),
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
