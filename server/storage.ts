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
  personLeads,
  type District,
  type Cnr,
  type CnrOrder,
  type PdfText,
  type OrderMetadata,
  type BusinessEntity,
  type EntityContact,
  type CaseEntityLink,
  type ProcessingJob,
  type PersonLead,
  type InsertDistrict,
  type InsertCnr,
  type InsertCnrOrder,
  type InsertPdfText,
  type InsertOrderMetadata,
  type InsertBusinessEntity,
  type InsertEntityContact,
  type InsertCaseEntityLink,
  type InsertProcessingJob,
  type InsertPersonLead,
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
  getOrdersByIds(ids: number[]): Promise<CnrOrder[]>;
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
  getAnalyticsTrends(days: number): Promise<{
    date: string;
    pdfs: number;
    leads: number;
  }[]>;
  getOrderTypeDistribution(): Promise<{
    orderType: string;
    count: number;
  }[]>;
  
  getOrdersWithPdfNoText(limit?: number): Promise<CnrOrder[]>;
  getOrdersWithTextNoMetadata(limit?: number): Promise<CnrOrder[]>;
  getPdfTextByOrderId(orderId: number): Promise<PdfText | undefined>;
  getEntitiesPendingEnrichment(limit?: number): Promise<BusinessEntity[]>;
  getBusinessEntityByNormalizedName(nameNormalized: string): Promise<BusinessEntity | undefined>;
  getProcessingStats(): Promise<{
    pendingTextExtraction: number;
    pendingClassification: number;
    pendingEnrichment: number;
    failedJobs: number;
    runningJobs: number;
  }>;
  updateBusinessEntityWithEnrichment(id: number, data: Partial<{
    cin: string;
    llpin: string;
    gstin: string;
    pan: string;
    registeredAddress: string;
    city: string;
    state: string;
    pincode: string;
    email: string;
    phone: string;
    website: string;
    companyStatus: string;
    dataSource: string;
    enrichmentStatus: string;
  }>): Promise<void>;
  
  getPersonLeads(limit?: number): Promise<(PersonLead & { cnrOrder?: CnrOrder & { cnr?: Cnr } })[]>;
  createPersonLead(data: InsertPersonLead): Promise<PersonLead>;
  getPersonLeadsByOrderId(orderId: number): Promise<PersonLead[]>;
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
    const CHUNK_SIZE = 100;
    const results: Cnr[] = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const inserted = await db.insert(cnrs).values(chunk).returning();
      results.push(...inserted);
    }
    return results;
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
    const CHUNK_SIZE = 100;
    const results: CnrOrder[] = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const inserted = await db.insert(cnrOrders).values(chunk).returning();
      results.push(...inserted);
    }
    return results;
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

  async getOrdersByIds(ids: number[]): Promise<CnrOrder[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(cnrOrders)
      .where(sql`${cnrOrders.id} = ANY(ARRAY[${sql.raw(ids.join(','))}]::int[])`);
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
        districtId: districts.id,
        cnrsCount: sql<number>`COUNT(DISTINCT ${cnrs.id})`,
        ordersCount: sql<number>`COUNT(DISTINCT ${cnrOrders.id})`,
      })
      .from(districts)
      .leftJoin(cnrs, eq(districts.id, cnrs.districtId))
      .leftJoin(cnrOrders, eq(cnrs.id, cnrOrders.cnrId))
      .groupBy(districts.id)
      .orderBy(districts.name);

    const leadsCountResults = await db
      .select({
        districtId: cnrs.districtId,
        leadsCount: sql<number>`COUNT(DISTINCT ${businessEntities.id})`,
      })
      .from(businessEntities)
      .innerJoin(caseEntityLinks, eq(businessEntities.id, caseEntityLinks.entityId))
      .innerJoin(cnrOrders, eq(caseEntityLinks.cnrOrderId, cnrOrders.id))
      .innerJoin(cnrs, eq(cnrOrders.cnrId, cnrs.id))
      .groupBy(cnrs.districtId);

    const leadsMap = new Map(leadsCountResults.map((l) => [l.districtId, Number(l.leadsCount) || 0]));

    return results.map((r) => ({
      districtName: r.districtName,
      cnrsCount: Number(r.cnrsCount) || 0,
      ordersCount: Number(r.ordersCount) || 0,
      leadsCount: leadsMap.get(r.districtId) || 0,
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

  async getBusinessEntityByNormalizedName(nameNormalized: string): Promise<BusinessEntity | undefined> {
    const [entity] = await db.select().from(businessEntities).where(eq(businessEntities.nameNormalized, nameNormalized));
    return entity;
  }

  async updateBusinessEntityWithEnrichment(id: number, data: Partial<{
    cin: string;
    llpin: string;
    gstin: string;
    pan: string;
    registeredAddress: string;
    city: string;
    state: string;
    pincode: string;
    email: string;
    phone: string;
    website: string;
    companyStatus: string;
    dataSource: string;
    enrichmentStatus: string;
  }>): Promise<void> {
    await db
      .update(businessEntities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businessEntities.id, id));
  }

  async getAnalyticsTrends(days: number): Promise<{
    date: string;
    pdfs: number;
    leads: number;
  }[]> {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);
    const startDateStr = startDate.toISOString().split("T")[0];

    const pdfResults = await db
      .select({
        date: sql<string>`DATE(${cnrOrders.lastCheckedAt})`,
        count: count(),
      })
      .from(cnrOrders)
      .where(
        and(
          eq(cnrOrders.pdfExists, true),
          sql`${cnrOrders.lastCheckedAt} >= ${startDateStr}::date`
        )
      )
      .groupBy(sql`DATE(${cnrOrders.lastCheckedAt})`);

    const leadsResults = await db
      .select({
        date: sql<string>`DATE(${businessEntities.createdAt})`,
        count: count(),
      })
      .from(businessEntities)
      .where(sql`${businessEntities.createdAt} >= ${startDateStr}::date`)
      .groupBy(sql`DATE(${businessEntities.createdAt})`);

    const pdfMap = new Map(pdfResults.map((r) => [r.date, Number(r.count) || 0]));
    const leadsMap = new Map(leadsResults.map((r) => [r.date, Number(r.count) || 0]));

    const trends: Array<{ date: string; pdfs: number; leads: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      trends.push({
        date: dateStr,
        pdfs: pdfMap.get(dateStr) || 0,
        leads: leadsMap.get(dateStr) || 0,
      });
    }
    return trends;
  }

  async getOrderTypeDistribution(): Promise<{
    orderType: string;
    count: number;
  }[]> {
    const results = await db
      .select({
        orderType: orderMetadata.orderType,
        count: count(),
      })
      .from(orderMetadata)
      .where(sql`${orderMetadata.orderType} IS NOT NULL`)
      .groupBy(orderMetadata.orderType)
      .orderBy(desc(count()));

    return results.map((r) => ({
      orderType: r.orderType || "Unknown",
      count: Number(r.count) || 0,
    }));
  }

  async getProcessingStats(): Promise<{
    pendingTextExtraction: number;
    pendingClassification: number;
    pendingEnrichment: number;
    failedJobs: number;
    runningJobs: number;
  }> {
    const [pendingTextExtractionResult] = await db
      .select({ count: count() })
      .from(cnrOrders)
      .leftJoin(pdfTexts, eq(cnrOrders.id, pdfTexts.cnrOrderId))
      .where(and(eq(cnrOrders.pdfExists, true), isNull(pdfTexts.id)));
    
    const [pendingClassificationResult] = await db
      .select({ count: count() })
      .from(cnrOrders)
      .innerJoin(pdfTexts, eq(cnrOrders.id, pdfTexts.cnrOrderId))
      .leftJoin(orderMetadata, eq(cnrOrders.id, orderMetadata.cnrOrderId))
      .where(isNull(orderMetadata.id));
    
    const [pendingEnrichmentResult] = await db
      .select({ count: count() })
      .from(businessEntities)
      .where(eq(businessEntities.enrichmentStatus, "pending"));
    
    const [failedJobsResult] = await db
      .select({ count: count() })
      .from(processingJobs)
      .where(eq(processingJobs.status, "failed"));
    
    const [runningJobsResult] = await db
      .select({ count: count() })
      .from(processingJobs)
      .where(sql`${processingJobs.status} IN ('pending', 'processing')`);

    return {
      pendingTextExtraction: Number(pendingTextExtractionResult?.count) || 0,
      pendingClassification: Number(pendingClassificationResult?.count) || 0,
      pendingEnrichment: Number(pendingEnrichmentResult?.count) || 0,
      failedJobs: Number(failedJobsResult?.count) || 0,
      runningJobs: Number(runningJobsResult?.count) || 0,
    };
  }

  async getPersonLeads(limit = 100): Promise<(PersonLead & { cnrOrder?: CnrOrder & { cnr?: Cnr } })[]> {
    const results = await db
      .select({
        personLead: personLeads,
        cnrOrder: cnrOrders,
        cnr: cnrs,
      })
      .from(personLeads)
      .leftJoin(cnrOrders, eq(personLeads.cnrOrderId, cnrOrders.id))
      .leftJoin(cnrs, eq(cnrOrders.cnrId, cnrs.id))
      .orderBy(desc(personLeads.createdAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.personLead,
      cnrOrder: r.cnrOrder
        ? {
            ...r.cnrOrder,
            cnr: r.cnr || undefined,
          }
        : undefined,
    }));
  }

  async createPersonLead(data: InsertPersonLead): Promise<PersonLead> {
    const [personLead] = await db.insert(personLeads).values(data).returning();
    return personLead;
  }

  async getPersonLeadsByOrderId(orderId: number): Promise<PersonLead[]> {
    return db.select().from(personLeads).where(eq(personLeads.cnrOrderId, orderId));
  }
}

export const storage = new DatabaseStorage();
