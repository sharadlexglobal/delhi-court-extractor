import { db } from "./db";
import { eq, desc, and, sql, count, isNull } from "drizzle-orm";
import {
  districts,
  cnrs,
  cnrOrders,
  pdfTexts,
  orderMetadata,
  businessEntities,
  entityContacts,
  caseEntityLinks,
  processingJobs,
  type District,
  type Cnr,
  type CnrOrder,
  type PdfText,
  type OrderMetadata,
  type BusinessEntity,
  type EntityContact,
  type CaseEntityLink,
  type ProcessingJob,
  type InsertDistrict,
  type InsertCnr,
  type InsertCnrOrder,
  type InsertPdfText,
  type InsertOrderMetadata,
  type InsertBusinessEntity,
  type InsertEntityContact,
  type InsertCaseEntityLink,
  type InsertProcessingJob,
} from "@shared/schema";

export interface IStorage {
  getDistricts(): Promise<District[]>;
  getDistrictById(id: number): Promise<District | undefined>;
  createDistrict(data: InsertDistrict): Promise<District>;
  
  getCnrs(limit?: number): Promise<(Cnr & { district?: District; ordersCount?: number })[]>;
  getCnrById(id: number): Promise<Cnr | undefined>;
  getCnrByCnr(cnr: string): Promise<Cnr | undefined>;
  createCnr(data: InsertCnr): Promise<Cnr>;
  createCnrsBatch(data: InsertCnr[]): Promise<Cnr[]>;
  
  getOrders(limit?: number): Promise<(CnrOrder & { cnr?: Cnr & { district?: District }; metadata?: OrderMetadata | null })[]>;
  getOrderById(id: number): Promise<CnrOrder | undefined>;
  createOrder(data: InsertCnrOrder): Promise<CnrOrder>;
  createOrdersBatch(data: InsertCnrOrder[]): Promise<CnrOrder[]>;
  updateOrderPdfStatus(id: number, pdfExists: boolean, httpStatusCode?: number): Promise<void>;
  
  createPdfText(data: InsertPdfText): Promise<PdfText>;
  
  createOrderMetadata(data: InsertOrderMetadata): Promise<OrderMetadata>;
  
  getBusinessEntities(limit?: number): Promise<(BusinessEntity & { contacts?: EntityContact[]; casesCount?: number })[]>;
  getBusinessEntityById(id: number): Promise<BusinessEntity | undefined>;
  createBusinessEntity(data: InsertBusinessEntity): Promise<BusinessEntity>;
  updateBusinessEntityEnrichmentStatus(id: number, status: string): Promise<void>;
  
  createEntityContact(data: InsertEntityContact): Promise<EntityContact>;
  
  createCaseEntityLink(data: InsertCaseEntityLink): Promise<CaseEntityLink>;
  
  getProcessingJobs(): Promise<ProcessingJob[]>;
  getProcessingJobById(id: number): Promise<ProcessingJob | undefined>;
  createProcessingJob(data: InsertProcessingJob): Promise<ProcessingJob>;
  updateProcessingJobProgress(id: number, processed: number, successful: number, failed: number): Promise<void>;
  updateProcessingJobStatus(id: number, status: string, error?: string): Promise<void>;
  updateProcessingJobStarted(id: number): Promise<void>;
  
  getPendingOrders(limit?: number): Promise<CnrOrder[]>;
  updateOrderPdfPath(id: number, pdfPath: string, pdfSizeBytes: number): Promise<void>;
  
  getAnalyticsOverview(): Promise<{
    totalCnrs: number;
    totalOrders: number;
    pdfsDownloaded: number;
    businessLeads: number;
  }>;
  getAnalyticsByDistrict(): Promise<{
    districtName: string;
    cnrsCount: number;
    ordersCount: number;
    leadsCount: number;
  }[]>;
  
  getOrdersWithPdfNoText(limit?: number): Promise<CnrOrder[]>;
  getOrdersWithTextNoMetadata(limit?: number): Promise<CnrOrder[]>;
  getPdfTextByOrderId(orderId: number): Promise<PdfText | undefined>;
  getEntitiesPendingEnrichment(limit?: number): Promise<BusinessEntity[]>;
}

export class DatabaseStorage implements IStorage {
  async getDistricts(): Promise<District[]> {
    return db.select().from(districts).orderBy(districts.name);
  }

  async getDistrictById(id: number): Promise<District | undefined> {
    const [district] = await db.select().from(districts).where(eq(districts.id, id));
    return district;
  }

  async createDistrict(data: InsertDistrict): Promise<District> {
    const [district] = await db.insert(districts).values(data).returning();
    return district;
  }

  async getCnrs(limit = 100): Promise<(Cnr & { district?: District; ordersCount?: number })[]> {
    const results = await db
      .select({
        cnr: cnrs,
        district: districts,
        ordersCount: sql<number>`(SELECT COUNT(*) FROM cnr_orders WHERE cnr_orders.cnr_id = ${cnrs.id})`.as("orders_count"),
      })
      .from(cnrs)
      .leftJoin(districts, eq(cnrs.districtId, districts.id))
      .orderBy(desc(cnrs.createdAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.cnr,
      district: r.district || undefined,
      ordersCount: Number(r.ordersCount) || 0,
    }));
  }

  async getCnrById(id: number): Promise<Cnr | undefined> {
    const [cnr] = await db.select().from(cnrs).where(eq(cnrs.id, id));
    return cnr;
  }

  async getCnrByCnr(cnr: string): Promise<Cnr | undefined> {
    const [result] = await db.select().from(cnrs).where(eq(cnrs.cnr, cnr));
    return result;
  }

  async createCnr(data: InsertCnr): Promise<Cnr> {
    const [cnr] = await db.insert(cnrs).values(data).returning();
    return cnr;
  }

  async createCnrsBatch(data: InsertCnr[]): Promise<Cnr[]> {
    if (data.length === 0) return [];
    return db.insert(cnrs).values(data).returning();
  }

  async getOrders(limit = 100): Promise<(CnrOrder & { cnr?: Cnr & { district?: District }; metadata?: OrderMetadata | null })[]> {
    const results = await db
      .select({
        order: cnrOrders,
        cnr: cnrs,
        district: districts,
        metadata: orderMetadata,
      })
      .from(cnrOrders)
      .leftJoin(cnrs, eq(cnrOrders.cnrId, cnrs.id))
      .leftJoin(districts, eq(cnrs.districtId, districts.id))
      .leftJoin(orderMetadata, eq(cnrOrders.id, orderMetadata.cnrOrderId))
      .orderBy(desc(cnrOrders.createdAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.order,
      cnr: r.cnr ? { ...r.cnr, district: r.district || undefined } : undefined,
      metadata: r.metadata || null,
    }));
  }

  async getOrderById(id: number): Promise<CnrOrder | undefined> {
    const [order] = await db.select().from(cnrOrders).where(eq(cnrOrders.id, id));
    return order;
  }

  async createOrder(data: InsertCnrOrder): Promise<CnrOrder> {
    const [order] = await db.insert(cnrOrders).values(data).returning();
    return order;
  }

  async createOrdersBatch(data: InsertCnrOrder[]): Promise<CnrOrder[]> {
    if (data.length === 0) return [];
    return db.insert(cnrOrders).values(data).returning();
  }

  async updateOrderPdfStatus(id: number, pdfExists: boolean, httpStatusCode?: number): Promise<void> {
    if (pdfExists) {
      await db
        .update(cnrOrders)
        .set({
          pdfExists,
          httpStatusCode,
          lastCheckedAt: new Date(),
        })
        .where(eq(cnrOrders.id, id));
    } else {
      await db
        .update(cnrOrders)
        .set({
          pdfExists,
          httpStatusCode,
          retryCount: sql`${cnrOrders.retryCount} + 1`,
          lastCheckedAt: new Date(),
        })
        .where(eq(cnrOrders.id, id));
    }
  }

  async createPdfText(data: InsertPdfText): Promise<PdfText> {
    const [pdfText] = await db.insert(pdfTexts).values(data).returning();
    return pdfText;
  }

  async createOrderMetadata(data: InsertOrderMetadata): Promise<OrderMetadata> {
    const [metadata] = await db.insert(orderMetadata).values(data).returning();
    return metadata;
  }

  async getBusinessEntities(limit = 100): Promise<(BusinessEntity & { contacts?: EntityContact[]; casesCount?: number })[]> {
    const results = await db
      .select({
        entity: businessEntities,
        casesCount: sql<number>`(SELECT COUNT(*) FROM case_entity_links WHERE case_entity_links.entity_id = ${businessEntities.id})`.as("cases_count"),
      })
      .from(businessEntities)
      .orderBy(desc(businessEntities.createdAt))
      .limit(limit);

    const entityIds = results.map((r) => r.entity.id);
    const contacts = entityIds.length > 0
      ? await db.select().from(entityContacts).where(sql`${entityContacts.entityId} = ANY(ARRAY[${sql.join(entityIds, sql`, `)}]::int[])`)
      : [];

    return results.map((r) => ({
      ...r.entity,
      contacts: contacts.filter((c) => c.entityId === r.entity.id),
      casesCount: Number(r.casesCount) || 0,
    }));
  }

  async getBusinessEntityById(id: number): Promise<BusinessEntity | undefined> {
    const [entity] = await db.select().from(businessEntities).where(eq(businessEntities.id, id));
    return entity;
  }

  async createBusinessEntity(data: InsertBusinessEntity): Promise<BusinessEntity> {
    const [entity] = await db.insert(businessEntities).values(data).returning();
    return entity;
  }

  async updateBusinessEntityEnrichmentStatus(id: number, status: string): Promise<void> {
    await db
      .update(businessEntities)
      .set({ enrichmentStatus: status, updatedAt: new Date() })
      .where(eq(businessEntities.id, id));
  }

  async createEntityContact(data: InsertEntityContact): Promise<EntityContact> {
    const [contact] = await db.insert(entityContacts).values(data).returning();
    return contact;
  }

  async createCaseEntityLink(data: InsertCaseEntityLink): Promise<CaseEntityLink> {
    const [link] = await db.insert(caseEntityLinks).values(data).returning();
    return link;
  }

  async getProcessingJobs(): Promise<ProcessingJob[]> {
    return db.select().from(processingJobs).orderBy(desc(processingJobs.createdAt)).limit(50);
  }

  async getProcessingJobById(id: number): Promise<ProcessingJob | undefined> {
    const [job] = await db.select().from(processingJobs).where(eq(processingJobs.id, id));
    return job;
  }

  async createProcessingJob(data: InsertProcessingJob): Promise<ProcessingJob> {
    const [job] = await db.insert(processingJobs).values(data).returning();
    return job;
  }

  async updateProcessingJobProgress(id: number, processed: number, successful: number, failed: number): Promise<void> {
    await db
      .update(processingJobs)
      .set({ processedItems: processed, successfulItems: successful, failedItems: failed })
      .where(eq(processingJobs.id, id));
  }

  async updateProcessingJobStatus(id: number, status: string, error?: string): Promise<void> {
    await db
      .update(processingJobs)
      .set({
        status,
        lastError: error,
        completedAt: status === "completed" || status === "failed" ? new Date() : undefined,
      })
      .where(eq(processingJobs.id, id));
  }

  async getAnalyticsOverview(): Promise<{
    totalCnrs: number;
    totalOrders: number;
    pdfsDownloaded: number;
    businessLeads: number;
  }> {
    const [cnrCount] = await db.select({ count: count() }).from(cnrs);
    const [orderCount] = await db.select({ count: count() }).from(cnrOrders);
    const [pdfCount] = await db.select({ count: count() }).from(cnrOrders).where(eq(cnrOrders.pdfExists, true));
    const [leadsCount] = await db.select({ count: count() }).from(businessEntities);

    return {
      totalCnrs: cnrCount?.count || 0,
      totalOrders: orderCount?.count || 0,
      pdfsDownloaded: pdfCount?.count || 0,
      businessLeads: leadsCount?.count || 0,
    };
  }

  async getPendingOrders(limit = 100): Promise<CnrOrder[]> {
    const maxRetries = 3;
    return db
      .select()
      .from(cnrOrders)
      .where(
        and(
          eq(cnrOrders.pdfExists, false),
          sql`${cnrOrders.retryCount} < ${maxRetries}`
        )
      )
      .orderBy(sql`${cnrOrders.retryCount} ASC, ${cnrOrders.lastCheckedAt} NULLS FIRST`)
      .limit(limit);
  }

  async updateOrderPdfPath(id: number, pdfPath: string, pdfSizeBytes: number): Promise<void> {
    await db
      .update(cnrOrders)
      .set({
        pdfExists: true,
        pdfPath,
        pdfSizeBytes,
        lastCheckedAt: new Date(),
      })
      .where(eq(cnrOrders.id, id));
  }

  async updateProcessingJobStarted(id: number): Promise<void> {
    await db
      .update(processingJobs)
      .set({
        status: "processing",
        startedAt: new Date(),
      })
      .where(eq(processingJobs.id, id));
  }

  async getAnalyticsByDistrict(): Promise<{
    districtName: string;
    cnrsCount: number;
    ordersCount: number;
    leadsCount: number;
  }[]> {
    const results = await db
      .select({
        districtName: districts.name,
        cnrsCount: sql<number>`COUNT(DISTINCT ${cnrs.id})`,
        ordersCount: sql<number>`COUNT(DISTINCT ${cnrOrders.id})`,
      })
      .from(districts)
      .leftJoin(cnrs, eq(districts.id, cnrs.districtId))
      .leftJoin(cnrOrders, eq(cnrs.id, cnrOrders.cnrId))
      .groupBy(districts.id)
      .orderBy(districts.name);

    return results.map((r) => ({
      districtName: r.districtName,
      cnrsCount: Number(r.cnrsCount) || 0,
      ordersCount: Number(r.ordersCount) || 0,
      leadsCount: 0,
    }));
  }

  async getOrdersWithPdfNoText(limit = 100): Promise<CnrOrder[]> {
    return db
      .select({ order: cnrOrders })
      .from(cnrOrders)
      .leftJoin(pdfTexts, eq(cnrOrders.id, pdfTexts.cnrOrderId))
      .where(and(eq(cnrOrders.pdfExists, true), isNull(pdfTexts.id)))
      .limit(limit)
      .then(rows => rows.map(r => r.order));
  }

  async getOrdersWithTextNoMetadata(limit = 100): Promise<CnrOrder[]> {
    return db
      .select({ order: cnrOrders })
      .from(cnrOrders)
      .innerJoin(pdfTexts, eq(cnrOrders.id, pdfTexts.cnrOrderId))
      .leftJoin(orderMetadata, eq(cnrOrders.id, orderMetadata.cnrOrderId))
      .where(isNull(orderMetadata.id))
      .limit(limit)
      .then(rows => rows.map(r => r.order));
  }

  async getPdfTextByOrderId(orderId: number): Promise<PdfText | undefined> {
    const [pdfText] = await db.select().from(pdfTexts).where(eq(pdfTexts.cnrOrderId, orderId));
    return pdfText;
  }

  async getEntitiesPendingEnrichment(limit = 100): Promise<BusinessEntity[]> {
    return db
      .select()
      .from(businessEntities)
      .where(eq(businessEntities.enrichmentStatus, "pending"))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
