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
    binary_target: 'true',
  });
  return `http://api.scraperapi.com?${params.toString()}`;
}

function isValidPdf(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const header = buffer.slice(0, 8).toString('ascii');
  return header.startsWith('%PDF-');
}

async function fetchSinglePdf(order: CnrOrder & { cnr?: Cnr }): Promise<{ success: boolean; pdfPath?: string; pdfSize?: number; error?: string; httpStatus?: number }> {
  try {
    const fetchUrl = buildScraperApiUrl(order.url);
    console.log(`Fetching PDF via ${SCRAPER_API_KEY ? 'ScraperAPI (Indian IP, binary_target)' : 'direct'}: ${order.url}`);
    
    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        "Accept": "application/pdf, application/octet-stream, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const httpStatus = response.status;
    const contentType = response.headers.get("content-type") || "";
    console.log(`Response: status=${httpStatus}, content-type=${contentType}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.log(`Error response body (first 200 chars): ${errorText.slice(0, 200)}`);
      return { success: false, error: `HTTP ${httpStatus}: ${errorText.slice(0, 100)}`, httpStatus };
    }

    const buffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(buffer);
    console.log(`Downloaded ${pdfBuffer.length} bytes`);

    if (!isValidPdf(pdfBuffer)) {
      const preview = pdfBuffer.slice(0, 200).toString('utf8');
      console.log(`Invalid PDF header. First 200 bytes: ${preview}`);
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { success: false, error: `Invalid PDF: ${preview.slice(0, 50)}`, httpStatus };
    }

    if (pdfBuffer.length < 1000) {
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { success: false, error: "PDF too small (likely error page)", httpStatus };
    }

    const objectStorageService = new ObjectStorageService();
    const cnrString = order.cnr?.cnr || `unknown_${order.cnrId}`;
    const pdfPath = await objectStorageService.storePdf(pdfBuffer, cnrString, order.orderNo);

    console.log(`PDF saved successfully: ${pdfPath} (${pdfBuffer.length} bytes)`);
    return { 
      success: true, 
      pdfPath, 
      pdfSize: pdfBuffer.length,
      httpStatus 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`PDF fetch error: ${errorMessage}`);
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
