import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { cnrGenerationRequestSchema } from "@shared/schema";
import { fetchPdfsForJob } from "./pdf-fetcher.js";
import { fetchPdfsWithPlaywright, testPlaywrightPdfFetch } from "./playwright-pdf-fetcher.js";
import { fetchPdfsWithZenRows, testZenRowsPdfFetch } from "./zenrows-pdf-fetcher.js";
import { extractTextsForJob } from "./text-extractor.js";
import { classifyOrdersForJob } from "./classifier.js";
import { enrichEntitiesForJob } from "./entity-enrichment.js";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { seedDistricts } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getPdfFile(`/objects/${req.params.objectPath}`);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      console.error("Error fetching object:", error);
      return res.sendStatus(500);
    }
  });
  
  app.get("/api/districts", async (_req, res) => {
    try {
      const districts = await storage.getDistricts();
      res.json(districts);
    } catch (error) {
      console.error("Error fetching districts:", error);
      res.status(500).json({ error: "Failed to fetch districts" });
    }
  });

  app.get("/api/cnrs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const cnrs = await storage.getCnrs(limit);
      res.json(cnrs);
    } catch (error) {
      console.error("Error fetching CNRs:", error);
      res.status(500).json({ error: "Failed to fetch CNRs" });
    }
  });

  app.get("/api/cnrs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const cnr = await storage.getCnrById(id);
      if (!cnr) {
        return res.status(404).json({ error: "CNR not found" });
      }
      res.json(cnr);
    } catch (error) {
      console.error("Error fetching CNR:", error);
      res.status(500).json({ error: "Failed to fetch CNR" });
    }
  });

  app.post("/api/cnrs/generate", async (req, res) => {
    try {
      const validation = cnrGenerationRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { districtId, startSerial, endSerial, year, daysAhead, maxOrderNo, startDate } = validation.data;

      const district = await storage.getDistrictById(districtId);
      if (!district) {
        return res.status(404).json({ error: "District not found" });
      }

      const cnrsToCreate: Array<{
        districtId: number;
        cnr: string;
        serialNumber: number;
        year: number;
      }> = [];

      for (let serial = startSerial; serial <= endSerial; serial++) {
        const paddedSerial = serial.toString().padStart(district.serialWidth, "0");
        const yearStr = year.toString().slice(-3);
        const cnrString = `DL${district.codePrefix}${district.establishmentCode}${paddedSerial}${yearStr}`;

        const existing = await storage.getCnrByCnr(cnrString);
        if (!existing) {
          cnrsToCreate.push({
            districtId,
            cnr: cnrString,
            serialNumber: serial,
            year,
          });
        }
      }

      const createdCnrs = await storage.createCnrsBatch(cnrsToCreate);

      const ordersToCreate: Array<{
        cnrId: number;
        orderNo: number;
        orderDate: string;
        url: string;
        encodedPayload: string;
      }> = [];

      const baseDate = startDate ? new Date(startDate) : new Date();
      for (const cnr of createdCnrs) {
        for (let day = 0; day < daysAhead; day++) {
          const orderDate = new Date(baseDate);
          orderDate.setDate(orderDate.getDate() + day);
          const dateStr = orderDate.toISOString().split("T")[0];

          for (let orderNo = 1; orderNo <= maxOrderNo; orderNo++) {
            const payload = JSON.stringify({
              cino: cnr.cnr,
              order_no: orderNo,
              order_date: dateStr,
            });
            const encodedPayload = Buffer.from(payload).toString("base64");
            const url = `${district.baseUrl}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=${encodedPayload}`;

            ordersToCreate.push({
              cnrId: cnr.id,
              orderNo,
              orderDate: dateStr,
              url,
              encodedPayload,
            });
          }
        }
      }

      const createdOrders = await storage.createOrdersBatch(ordersToCreate);

      res.json({
        cnrsCreated: createdCnrs.length,
        ordersCreated: createdOrders.length,
        message: `Generated ${createdCnrs.length} CNRs with ${createdOrders.length} order combinations`,
      });
    } catch (error) {
      console.error("Error generating CNRs:", error);
      res.status(500).json({ error: "Failed to generate CNRs" });
    }
  });

  app.get("/api/orders", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const orders = await storage.getOrders(limit);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.get("/api/orders/:id/text", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pdfText = await storage.getPdfTextByOrderId(id);
      if (!pdfText) {
        return res.status(404).json({ error: "Extracted text not found" });
      }
      res.json(pdfText);
    } catch (error) {
      console.error("Error fetching extracted text:", error);
      res.status(500).json({ error: "Failed to fetch extracted text" });
    }
  });

  app.get("/api/leads", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const entities = await storage.getBusinessEntities(limit);
      res.json(entities);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/export", async (_req, res) => {
    try {
      const entities = await storage.getBusinessEntities(10000);
      
      const csvHeaders = [
        "ID",
        "Name",
        "Type",
        "CIN",
        "GSTIN",
        "City",
        "State",
        "Pincode",
        "Email",
        "Phone",
        "Website",
        "Company Status",
        "Enrichment Status",
        "Created At"
      ].join(",");
      
      const csvRows = entities.map(entity => {
        const escapeCsv = (val: string | null | undefined) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        return [
          entity.id,
          escapeCsv(entity.name),
          escapeCsv(entity.entityType),
          escapeCsv(entity.cin),
          escapeCsv(entity.gstin),
          escapeCsv(entity.city),
          escapeCsv(entity.state),
          escapeCsv(entity.pincode),
          escapeCsv(entity.email),
          escapeCsv(entity.phone),
          escapeCsv(entity.website),
          escapeCsv(entity.companyStatus),
          escapeCsv(entity.enrichmentStatus),
          entity.createdAt ? new Date(entity.createdAt).toISOString() : ""
        ].join(",");
      });
      
      const csv = [csvHeaders, ...csvRows].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=leads-export.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting leads:", error);
      res.status(500).json({ error: "Failed to export leads" });
    }
  });

  app.get("/api/leads/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entity = await storage.getBusinessEntityById(id);
      if (!entity) {
        return res.status(404).json({ error: "Lead not found" });
      }
      res.json(entity);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  app.get("/api/person-leads", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const personLeads = await storage.getPersonLeads(limit);
      res.json(personLeads);
    } catch (error) {
      console.error("Error fetching person leads:", error);
      res.status(500).json({ error: "Failed to fetch person leads" });
    }
  });

  app.get("/api/person-leads/export", async (_req, res) => {
    try {
      const personLeads = await storage.getPersonLeads(10000);
      
      const csvHeaders = [
        "ID",
        "Name",
        "Party Role",
        "Case Type",
        "Case Number",
        "Petitioner",
        "Is Fresh Case",
        "Fresh Case Phrase",
        "Address",
        "Phone",
        "Next Hearing Date",
        "Court Name",
        "Judge Name",
        "Confidence",
        "Created At"
      ].join(",");
      
      const csvRows = personLeads.map(lead => {
        const escapeCsv = (val: string | null | undefined) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        return [
          lead.id,
          escapeCsv(lead.name),
          escapeCsv(lead.partyRole),
          escapeCsv(lead.caseType),
          escapeCsv(lead.caseNumber),
          escapeCsv(lead.petitionerName),
          lead.isFreshCase ? "Yes" : "No",
          escapeCsv(lead.freshCasePhrase),
          escapeCsv(lead.address),
          escapeCsv(lead.phone),
          lead.nextHearingDate || "",
          escapeCsv(lead.courtName),
          escapeCsv(lead.judgeName),
          lead.confidence || "",
          lead.createdAt ? new Date(lead.createdAt).toISOString() : ""
        ].join(",");
      });
      
      const csv = [csvHeaders, ...csvRows].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=person-leads-export.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting person leads:", error);
      res.status(500).json({ error: "Failed to export person leads" });
    }
  });

  app.get("/api/person-leads/:orderId", async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const personLeads = await storage.getPersonLeadsByOrderId(orderId);
      res.json(personLeads);
    } catch (error) {
      console.error("Error fetching person leads by order:", error);
      res.status(500).json({ error: "Failed to fetch person leads" });
    }
  });

  app.post("/api/leads/:id/enrich", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entity = await storage.getBusinessEntityById(id);
      if (!entity) {
        return res.status(404).json({ error: "Lead not found" });
      }

      await storage.updateBusinessEntityEnrichmentStatus(id, "enriching");
      
      const { enrichEntity } = await import("./entity-enrichment.js");
      enrichEntity(entity).catch((error) => {
        console.error(`Background enrichment failed for entity ${id}:`, error);
      });
      
      res.json({ message: "Enrichment started", entityId: id });
    } catch (error) {
      console.error("Error enriching lead:", error);
      res.status(500).json({ error: "Failed to start enrichment" });
    }
  });

  app.get("/api/analytics/overview", async (_req, res) => {
    try {
      const overview = await storage.getAnalyticsOverview();
      res.json(overview);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/by-district", async (_req, res) => {
    try {
      const stats = await storage.getAnalyticsByDistrict();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching district analytics:", error);
      res.status(500).json({ error: "Failed to fetch district analytics" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const trends = await storage.getAnalyticsTrends(days);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trends" });
    }
  });

  app.get("/api/analytics/order-types", async (_req, res) => {
    try {
      const orderTypes = await storage.getOrderTypeDistribution();
      res.json(orderTypes);
    } catch (error) {
      console.error("Error fetching order types:", error);
      res.status(500).json({ error: "Failed to fetch order types" });
    }
  });

  app.get("/api/jobs", async (_req, res) => {
    try {
      const jobs = await storage.getProcessingJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getProcessingJobById(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.post("/api/jobs/start-pdf-download", async (req, res) => {
    try {
      const { limit = 100 } = req.body;
      
      const existingJobs = await storage.getProcessingJobs();
      const runningJob = existingJobs.find(j => j.status === "processing" || j.status === "pending");
      if (runningJob) {
        return res.json({ 
          message: "A download job is already running",
          jobId: runningJob.id,
          totalOrders: runningJob.totalItems,
          alreadyRunning: true
        });
      }
      
      const pendingOrders = await storage.getPendingOrders(limit);
      
      if (pendingOrders.length === 0) {
        return res.json({ message: "No pending orders to process", jobId: null });
      }

      const job = await storage.createProcessingJob({
        jobType: "pdf_download",
        status: "pending",
        totalItems: pendingOrders.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        parameters: JSON.stringify({ limit, orderIds: pendingOrders.map(o => o.id) }),
      });

      fetchPdfsForJob(job.id, pendingOrders);

      res.json({
        jobId: job.id,
        totalOrders: pendingOrders.length,
        message: `Started PDF download job for ${pendingOrders.length} orders`,
      });
    } catch (error) {
      console.error("Error starting PDF download job:", error);
      res.status(500).json({ error: "Failed to start PDF download job" });
    }
  });

  app.post("/api/jobs/extract-texts", async (req, res) => {
    try {
      const { limit = 100 } = req.body;
      
      const existingJobs = await storage.getProcessingJobs();
      const runningJob = existingJobs.find(j => 
        j.jobType === "text_extraction" && (j.status === "processing" || j.status === "pending")
      );
      if (runningJob) {
        return res.json({ 
          message: "A text extraction job is already running",
          jobId: runningJob.id,
          totalOrders: runningJob.totalItems,
          alreadyRunning: true
        });
      }
      
      const ordersNeedingText = await storage.getOrdersWithPdfNoText(limit);
      
      if (ordersNeedingText.length === 0) {
        return res.json({ message: "No orders need text extraction", jobId: null });
      }

      const job = await storage.createProcessingJob({
        jobType: "text_extraction",
        status: "pending",
        totalItems: ordersNeedingText.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        parameters: JSON.stringify({ limit, orderIds: ordersNeedingText.map(o => o.id) }),
      });

      extractTextsForJob(job.id, ordersNeedingText);

      res.json({
        jobId: job.id,
        totalOrders: ordersNeedingText.length,
        message: `Started text extraction job for ${ordersNeedingText.length} orders`,
      });
    } catch (error) {
      console.error("Error starting text extraction job:", error);
      res.status(500).json({ error: "Failed to start text extraction job" });
    }
  });

  app.post("/api/jobs/classify", async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({ error: "OPENAI_API_KEY is not configured. Please add your OpenAI API key to continue." });
      }

      const { limit = 100 } = req.body;
      
      const existingJobs = await storage.getProcessingJobs();
      const runningJob = existingJobs.find(j => 
        j.jobType === "classification" && (j.status === "processing" || j.status === "pending")
      );
      if (runningJob) {
        return res.json({ 
          message: "A classification job is already running",
          jobId: runningJob.id,
          totalOrders: runningJob.totalItems,
          alreadyRunning: true
        });
      }
      
      const ordersNeedingClassification = await storage.getOrdersWithTextNoMetadata(limit);
      
      if (ordersNeedingClassification.length === 0) {
        return res.json({ message: "No orders need classification", jobId: null });
      }

      const job = await storage.createProcessingJob({
        jobType: "classification",
        status: "pending",
        totalItems: ordersNeedingClassification.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        parameters: JSON.stringify({ limit, orderIds: ordersNeedingClassification.map(o => o.id) }),
      });

      classifyOrdersForJob(job.id, ordersNeedingClassification);

      res.json({
        jobId: job.id,
        totalOrders: ordersNeedingClassification.length,
        message: `Started classification job for ${ordersNeedingClassification.length} orders`,
      });
    } catch (error) {
      console.error("Error starting classification job:", error);
      res.status(500).json({ error: "Failed to start classification job" });
    }
  });

  app.post("/api/jobs/enrich-entities", async (req, res) => {
    try {
      const { limit = 100 } = req.body;
      
      const existingJobs = await storage.getProcessingJobs();
      const runningJob = existingJobs.find(j => 
        j.jobType === "enrichment" && (j.status === "processing" || j.status === "pending")
      );
      if (runningJob) {
        return res.json({ 
          message: "An enrichment job is already running",
          jobId: runningJob.id,
          totalEntities: runningJob.totalItems,
          alreadyRunning: true
        });
      }
      
      const entitiesPendingEnrichment = await storage.getEntitiesPendingEnrichment(limit);
      
      if (entitiesPendingEnrichment.length === 0) {
        return res.json({ message: "No entities need enrichment", jobId: null });
      }

      const job = await storage.createProcessingJob({
        jobType: "enrichment",
        status: "pending",
        totalItems: entitiesPendingEnrichment.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        parameters: JSON.stringify({ limit, entityIds: entitiesPendingEnrichment.map(e => e.id) }),
      });

      enrichEntitiesForJob(job.id, entitiesPendingEnrichment);

      res.json({
        jobId: job.id,
        totalEntities: entitiesPendingEnrichment.length,
        message: `Started enrichment job for ${entitiesPendingEnrichment.length} entities`,
      });
    } catch (error) {
      console.error("Error starting enrichment job:", error);
      res.status(500).json({ error: "Failed to start enrichment job" });
    }
  });

  app.post("/api/seed-districts", async (_req, res) => {
    try {
      const result = await seedDistricts();
      res.json({
        message: "Districts seeded successfully",
        added: result.added,
        skipped: result.skipped,
      });
    } catch (error) {
      console.error("Error seeding districts:", error);
      res.status(500).json({ error: "Failed to seed districts" });
    }
  });

  app.get("/api/analytics/processing-stats", async (_req, res) => {
    try {
      const stats = await storage.getProcessingStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching processing stats:", error);
      res.status(500).json({ error: "Failed to fetch processing stats" });
    }
  });

  app.post("/api/test-playwright-pdf", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      console.log(`Testing Playwright PDF fetch for: ${url}`);
      const result = await testPlaywrightPdfFetch(url);
      res.json(result);
    } catch (error) {
      console.error("Error testing Playwright PDF:", error);
      res.status(500).json({ error: "Failed to test PDF fetch" });
    }
  });

  app.post("/api/jobs/start-pdf-download-playwright", async (req, res) => {
    try {
      const { limit = 100 } = req.body;
      
      const existingJobs = await storage.getProcessingJobs();
      const runningJob = existingJobs.find(j => j.status === "processing" || j.status === "pending");
      if (runningJob) {
        return res.json({ 
          message: "A download job is already running",
          jobId: runningJob.id,
          totalOrders: runningJob.totalItems,
          alreadyRunning: true
        });
      }
      
      const pendingOrders = await storage.getPendingOrders(limit);
      
      if (pendingOrders.length === 0) {
        return res.json({ message: "No pending orders to process", jobId: null });
      }

      const job = await storage.createProcessingJob({
        jobType: "pdf_download",
        status: "pending",
        totalItems: pendingOrders.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        parameters: JSON.stringify({ limit, orderIds: pendingOrders.map(o => o.id), method: 'playwright' }),
      });

      fetchPdfsWithPlaywright(job.id, pendingOrders);

      res.json({
        jobId: job.id,
        totalOrders: pendingOrders.length,
        message: `Started Playwright PDF download job for ${pendingOrders.length} orders`,
      });
    } catch (error) {
      console.error("Error starting Playwright PDF download job:", error);
      res.status(500).json({ error: "Failed to start Playwright PDF download job" });
    }
  });

  app.post("/api/test-zenrows-pdf", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      console.log(`Testing ZenRows PDF fetch for: ${url}`);
      const result = await testZenRowsPdfFetch(url);
      res.json(result);
    } catch (error) {
      console.error("Error testing ZenRows PDF:", error);
      res.status(500).json({ error: "Failed to test PDF fetch" });
    }
  });

  app.post("/api/jobs/start-pdf-download-zenrows", async (req, res) => {
    try {
      if (!process.env.ZENROWS_API_KEY) {
        return res.status(400).json({ error: "ZENROWS_API_KEY is not configured" });
      }

      const { limit = 100 } = req.body;
      
      const existingJobs = await storage.getProcessingJobs();
      const runningJob = existingJobs.find(j => j.status === "processing" || j.status === "pending");
      if (runningJob) {
        return res.json({ 
          message: "A download job is already running",
          jobId: runningJob.id,
          totalOrders: runningJob.totalItems,
          alreadyRunning: true
        });
      }
      
      const pendingOrders = await storage.getPendingOrders(limit);
      
      if (pendingOrders.length === 0) {
        return res.json({ message: "No pending orders to process", jobId: null });
      }

      const job = await storage.createProcessingJob({
        jobType: "pdf_download",
        status: "pending",
        totalItems: pendingOrders.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        parameters: JSON.stringify({ limit, orderIds: pendingOrders.map(o => o.id), method: 'zenrows' }),
      });

      fetchPdfsWithZenRows(job.id, pendingOrders);

      res.json({
        jobId: job.id,
        totalOrders: pendingOrders.length,
        message: `Started ZenRows PDF download job for ${pendingOrders.length} orders`,
      });
    } catch (error) {
      console.error("Error starting ZenRows PDF download job:", error);
      res.status(500).json({ error: "Failed to start ZenRows PDF download job" });
    }
  });

  app.post("/api/test-complete-workflow", async (req, res) => {
    try {
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }
      
      if (!process.env.ZENROWS_API_KEY) {
        return res.status(400).json({ error: "ZENROWS_API_KEY is not configured" });
      }
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (!order.url) {
        return res.status(400).json({ error: "Order has no URL" });
      }
      
      const cnr = await storage.getCnrById(order.cnrId);
      const orderWithCnr = { ...order, cnr };
      
      console.log(`[Workflow Test] Step 1: Downloading PDF for order ${orderId}...`);
      
      const { fetchPdfsWithZenRows } = await import("./zenrows-pdf-fetcher");
      const { ObjectStorageService } = await import("./objectStorage");
      const { extractTextFromPdf } = await import("./text-extractor");
      const axios = (await import("axios")).default;
      
      const apiKey = process.env.ZENROWS_API_KEY;
      const response = await axios.get('https://api.zenrows.com/v1/', {
        params: {
          url: order.url,
          apikey: apiKey,
          premium_proxy: 'true',
          js_render: 'true',
        },
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      
      const buffer = Buffer.from(response.data);
      const pdfHeader = buffer.slice(0, 8).toString('ascii');
      
      if (!pdfHeader.startsWith('%PDF-')) {
        return res.json({
          step1_download: "failed",
          error: "Downloaded content is not a valid PDF",
          preview: buffer.slice(0, 100).toString('utf8'),
        });
      }
      
      console.log(`[Workflow Test] Step 2: Saving PDF to Object Storage (${buffer.length} bytes)...`);
      
      const objectStorage = new ObjectStorageService();
      const cnrString = cnr?.cnr || `unknown_${order.cnrId}`;
      const pdfPath = await objectStorage.storePdf(buffer, cnrString, order.orderNo);
      
      await storage.updateOrderPdfPath(order.id, pdfPath, buffer.length);
      
      console.log(`[Workflow Test] Step 3: Extracting text from PDF...`);
      
      const extractionResult = await extractTextFromPdf(pdfPath);
      
      if (extractionResult.success && extractionResult.rawText.length > 0) {
        await storage.createPdfText({
          cnrOrderId: order.id,
          rawText: extractionResult.rawText,
          cleanedText: extractionResult.cleanedText,
          pageCount: extractionResult.pageCount,
          wordCount: extractionResult.wordCount,
        });
      }
      
      res.json({
        step1_download: "success",
        pdfSize: buffer.length,
        step2_storage: "success",
        pdfPath: pdfPath,
        step3_extraction: extractionResult.success ? "success" : "failed",
        extractedText: {
          pageCount: extractionResult.pageCount,
          wordCount: extractionResult.wordCount,
          preview: extractionResult.cleanedText.slice(0, 500),
          errorMessage: extractionResult.errorMessage,
        },
      });
      
    } catch (error) {
      console.error("[Workflow Test] Error:", error);
      res.status(500).json({ 
        error: "Workflow test failed", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  return httpServer;
}
