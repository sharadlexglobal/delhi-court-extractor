import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { cnrGenerationRequestSchema } from "@shared/schema";
import { fetchPdfsForJob } from "./pdf-fetcher.js";
import { extractTextsForJob } from "./text-extractor.js";
import { classifyOrdersForJob } from "./classifier.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

      const { districtId, startSerial, endSerial, year, daysAhead, maxOrderNo } = validation.data;

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

      const today = new Date();
      for (const cnr of createdCnrs) {
        for (let day = 0; day < daysAhead; day++) {
          const orderDate = new Date(today);
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

  app.post("/api/leads/:id/enrich", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entity = await storage.getBusinessEntityById(id);
      if (!entity) {
        return res.status(404).json({ error: "Lead not found" });
      }

      await storage.updateBusinessEntityEnrichmentStatus(id, "enriching");
      
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
      const trends: Array<{ date: string; pdfs: number; leads: number }> = [];
      const today = new Date();
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        trends.push({
          date: date.toISOString().split("T")[0],
          pdfs: 0,
          leads: 0,
        });
      }
      
      res.json(trends);
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trends" });
    }
  });

  app.get("/api/analytics/order-types", async (_req, res) => {
    try {
      res.json([]);
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

  return httpServer;
}
