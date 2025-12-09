import axios from "axios";
import { storage } from "./storage";
import type { CnrOrder, Cnr } from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";

const ALLOWED_COURT_DOMAINS = [
  'dcourts.gov.in',
  'ecourts.gov.in',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return ALLOWED_COURT_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

function isValidPdf(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const header = buffer.slice(0, 8).toString('ascii');
  return header.startsWith('%PDF-');
}

async function fetchSinglePdfWithZenRows(
  order: CnrOrder & { cnr?: Cnr },
  apiKey: string
): Promise<{ success: boolean; pdfPath?: string; pdfSize?: number; error?: string; httpStatus?: number }> {
  if (!isAllowedUrl(order.url)) {
    console.error(`[ZenRows] URL not allowed: ${order.url}`);
    return { 
      success: false, 
      error: 'URL not allowed. Only Delhi court domains are permitted.' 
    };
  }

  try {
    console.log(`[ZenRows] Fetching PDF: ${order.url}`);
    
    const parsedUrl = new URL(order.url);
    const referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;
    
    const response = await axios.get('https://api.zenrows.com/v1/', {
      params: {
        url: order.url,
        apikey: apiKey,
        premium_proxy: 'true',
        js_render: 'true',
        wait: '5000',
        wait_for: '.pdf-content,iframe,object',
      },
      headers: {
        'Referer': referer,
      },
      responseType: 'arraybuffer',
      timeout: 180000,
    });

    const httpStatus = response.status;
    const buffer = Buffer.from(response.data);
    
    console.log(`[ZenRows] Response: status=${httpStatus}, size=${buffer.length} bytes`);

    if (!isValidPdf(buffer)) {
      const preview = buffer.slice(0, 200).toString('utf8');
      console.log(`[ZenRows] Invalid PDF header. Preview: ${preview.slice(0, 100)}`);
      
      if (preview.includes('No record found') || preview.includes('error')) {
        return { 
          success: false, 
          error: 'No record found',
          httpStatus 
        };
      }
      
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { 
        success: false, 
        error: `Invalid PDF: ${preview.slice(0, 50)}`,
        httpStatus 
      };
    }

    if (buffer.length < 1000) {
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { 
        success: false, 
        error: "PDF too small (likely error page)",
        httpStatus 
      };
    }

    const objectStorageService = new ObjectStorageService();
    const cnrString = order.cnr?.cnr || `unknown_${order.cnrId}`;
    const pdfPath = await objectStorageService.storePdf(buffer, cnrString, order.orderNo);

    console.log(`[ZenRows] PDF saved successfully: ${pdfPath} (${buffer.length} bytes)`);
    return { 
      success: true, 
      pdfPath, 
      pdfSize: buffer.length,
      httpStatus 
    };

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const preview = data ? Buffer.from(data).slice(0, 100).toString('utf8') : '';
      console.error(`[ZenRows] HTTP error: status=${status}, preview=${preview}`);
      return { 
        success: false, 
        error: `HTTP ${status}: ${error.message}`,
        httpStatus: status
      };
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ZenRows] PDF fetch error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function fetchPdfsWithZenRows(
  jobId: number, 
  orders: (CnrOrder & { cnr?: Cnr })[]
): Promise<void> {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    console.error('[ZenRows] API key not configured');
    await storage.updateProcessingJobStatus(jobId, "failed");
    return;
  }

  await storage.updateProcessingJobStarted(jobId);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const result = await fetchSinglePdfWithZenRows(order, apiKey);
      processed++;

      if (result.success && result.pdfPath && result.pdfSize) {
        await storage.updateOrderPdfPath(order.id, result.pdfPath, result.pdfSize);
        successful++;
      } else {
        await storage.updateOrderPdfStatus(order.id, false, result.httpStatus);
        failed++;
      }

      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      processed++;
      failed++;
      console.error(`[ZenRows] Error processing order ${order.id}:`, error);
      await storage.updateOrderPdfStatus(order.id, false);
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    }
  }

  const finalStatus = failed === orders.length ? "failed" : "completed";
  await storage.updateProcessingJobStatus(jobId, finalStatus);
}

export async function testZenRowsPdfFetch(url: string): Promise<{
  success: boolean;
  pdfSize?: number;
  error?: string;
  preview?: string;
}> {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ZENROWS_API_KEY not configured' };
  }

  if (!isAllowedUrl(url)) {
    return { 
      success: false, 
      error: 'URL not allowed. Only Delhi court domains (dcourts.gov.in, ecourts.gov.in) are permitted.' 
    };
  }

  try {
    console.log(`[ZenRows Test] Fetching: ${url}`);
    
    const parsedUrl = new URL(url);
    const referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;
    
    const response = await axios.get('https://api.zenrows.com/v1/', {
      params: {
        url: url,
        apikey: apiKey,
        premium_proxy: 'true',
        js_render: 'true',
        wait: '5000',
        wait_for: '.pdf-content,iframe,object',
      },
      headers: {
        'Referer': referer,
      },
      responseType: 'arraybuffer',
      timeout: 180000,
    });

    const buffer = Buffer.from(response.data);
    const preview = buffer.slice(0, 100).toString('utf8');

    console.log(`[ZenRows Test] Response: status=${response.status}, size=${buffer.length} bytes`);

    if (isValidPdf(buffer)) {
      console.log(`[ZenRows Test] Valid PDF! Size: ${buffer.length} bytes`);
      return { 
        success: true, 
        pdfSize: buffer.length,
        preview: '%PDF-...'
      };
    } else {
      console.log(`[ZenRows Test] Not a valid PDF. Preview: ${preview}`);
      return { 
        success: false, 
        error: 'Response is not a valid PDF',
        preview: preview.slice(0, 100)
      };
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const preview = data ? Buffer.from(data).slice(0, 200).toString('utf8') : '';
      console.error(`[ZenRows Test] HTTP error: status=${status}, data=${preview}`);
      return { 
        success: false, 
        error: `HTTP ${status}: ${error.message}`,
        preview: preview.slice(0, 100)
      };
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ZenRows Test] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}
