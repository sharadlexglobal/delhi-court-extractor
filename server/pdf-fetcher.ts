import { storage } from "./storage";
import type { CnrOrder, Cnr } from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

function buildScraperApiUrl(targetUrl: string): string {
  if (!SCRAPER_API_KEY) {
    return targetUrl;
  }
  const params = new URLSearchParams({
    api_key: SCRAPER_API_KEY,
    url: targetUrl,
    country_code: 'in',
  });
  return `http://api.scraperapi.com?${params.toString()}`;
}

async function fetchSinglePdf(order: CnrOrder & { cnr?: Cnr }): Promise<{ success: boolean; pdfPath?: string; pdfSize?: number; error?: string; httpStatus?: number }> {
  try {
    const fetchUrl = buildScraperApiUrl(order.url);
    console.log(`Fetching PDF via ${SCRAPER_API_KEY ? 'ScraperAPI (Indian IP)' : 'direct'}: ${order.url}`);
    
    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        "Accept": "application/pdf,*/*",
      },
    });

    const httpStatus = response.status;

    if (!response.ok) {
      return { success: false, error: `HTTP ${httpStatus}`, httpStatus };
    }

    const contentType = response.headers.get("content-type") || "";
    
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { success: false, error: "Not a PDF response", httpStatus };
    }

    const buffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(buffer);

    if (pdfBuffer.length < 100) {
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { success: false, error: "PDF too small (likely error page)", httpStatus };
    }

    const objectStorageService = new ObjectStorageService();
    const cnrString = order.cnr?.cnr || `unknown_${order.cnrId}`;
    const pdfPath = await objectStorageService.storePdf(pdfBuffer, cnrString, order.orderNo);

    return { 
      success: true, 
      pdfPath, 
      pdfSize: pdfBuffer.length,
      httpStatus 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

export async function fetchPdfsForJob(jobId: number, orders: (CnrOrder & { cnr?: Cnr })[]): Promise<void> {
  await storage.updateProcessingJobStarted(jobId);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const result = await fetchSinglePdf(order);
      processed++;

      if (result.success && result.pdfPath && result.pdfSize) {
        await storage.updateOrderPdfPath(order.id, result.pdfPath, result.pdfSize);
        successful++;
      } else {
        await storage.updateOrderPdfStatus(order.id, false, result.httpStatus);
        failed++;
      }

      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      processed++;
      failed++;
      console.error(`Error processing order ${order.id}:`, error);
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    }
  }

  const finalStatus = failed === orders.length ? "failed" : "completed";
  await storage.updateProcessingJobStatus(jobId, finalStatus);
}
