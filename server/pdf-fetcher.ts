import { storage } from "./storage";
import type { CnrOrder } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

const PDF_STORAGE_DIR = "./downloads/pdfs";

async function ensureDirectoryExists(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function fetchSinglePdf(order: CnrOrder): Promise<{ success: boolean; pdfPath?: string; pdfSize?: number; error?: string; httpStatus?: number }> {
  try {
    const response = await fetch(order.url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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

    await ensureDirectoryExists(PDF_STORAGE_DIR);
    
    const fileName = `${order.id}_${order.orderNo}_${order.orderDate}.pdf`;
    const filePath = path.join(PDF_STORAGE_DIR, fileName);
    
    fs.writeFileSync(filePath, pdfBuffer);

    return { 
      success: true, 
      pdfPath: filePath, 
      pdfSize: pdfBuffer.length,
      httpStatus 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

export async function fetchPdfsForJob(jobId: number, orders: CnrOrder[]): Promise<void> {
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
