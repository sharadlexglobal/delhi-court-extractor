import { chromium, type Browser, type BrowserContext } from 'playwright';
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

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
}

function isValidPdf(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const header = buffer.slice(0, 8).toString('ascii');
  return header.startsWith('%PDF-');
}

async function fetchSinglePdfWithPlaywright(
  order: CnrOrder & { cnr?: Cnr }
): Promise<{ success: boolean; pdfPath?: string; pdfSize?: number; error?: string; httpStatus?: number }> {
  if (!isAllowedUrl(order.url)) {
    console.error(`[Playwright] URL not allowed: ${order.url}`);
    return { 
      success: false, 
      error: 'URL not allowed. Only Delhi court domains are permitted.' 
    };
  }

  let context: BrowserContext | null = null;
  
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
    });
    
    const page = await context.newPage();
    
    console.log(`[Playwright] Fetching PDF: ${order.url}`);
    
    const responsePromise = page.waitForResponse(
      response => {
        const url = response.url();
        return url.includes('admin-ajax.php') && url.includes('get_order_pdf');
      },
      { timeout: 30000 }
    );
    
    await page.goto(order.url, { waitUntil: 'networkidle', timeout: 30000 });
    
    let response;
    try {
      response = await responsePromise;
    } catch {
      response = page.context().pages()[0]?.mainFrame()?.url() ? null : null;
    }
    
    if (!response) {
      const currentResponse = await page.evaluate(() => {
        return document.body?.innerText || '';
      });
      
      if (currentResponse.includes('%PDF')) {
        const content = await page.content();
        console.log(`[Playwright] Page contains PDF marker in content`);
      }
      
      return { 
        success: false, 
        error: 'Could not capture PDF response',
        httpStatus: 0
      };
    }
    
    const httpStatus = response.status();
    const contentType = response.headers()['content-type'] || '';
    console.log(`[Playwright] Response: status=${httpStatus}, content-type=${contentType}`);
    
    if (httpStatus !== 200) {
      return { 
        success: false, 
        error: `HTTP ${httpStatus}`,
        httpStatus 
      };
    }
    
    const buffer = await response.body();
    const pdfBuffer = Buffer.from(buffer);
    console.log(`[Playwright] Downloaded ${pdfBuffer.length} bytes`);
    
    if (!isValidPdf(pdfBuffer)) {
      const preview = pdfBuffer.slice(0, 200).toString('utf8');
      console.log(`[Playwright] Invalid PDF header. First 200 bytes: ${preview}`);
      
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
    
    if (pdfBuffer.length < 1000) {
      await storage.updateOrderPdfStatus(order.id, false, httpStatus);
      return { 
        success: false, 
        error: "PDF too small (likely error page)",
        httpStatus 
      };
    }
    
    const objectStorageService = new ObjectStorageService();
    const cnrString = order.cnr?.cnr || `unknown_${order.cnrId}`;
    const pdfPath = await objectStorageService.storePdf(pdfBuffer, cnrString, order.orderNo);
    
    console.log(`[Playwright] PDF saved successfully: ${pdfPath} (${pdfBuffer.length} bytes)`);
    return { 
      success: true, 
      pdfPath, 
      pdfSize: pdfBuffer.length,
      httpStatus 
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Playwright] PDF fetch error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

export async function fetchPdfsWithPlaywright(
  jobId: number, 
  orders: (CnrOrder & { cnr?: Cnr })[]
): Promise<void> {
  await storage.updateProcessingJobStarted(jobId);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const result = await fetchSinglePdfWithPlaywright(order);
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
      console.error(`[Playwright] Error processing order ${order.id}:`, error);
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    }
  }

  const finalStatus = failed === orders.length ? "failed" : "completed";
  await storage.updateProcessingJobStatus(jobId, finalStatus);
  
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

export async function testPlaywrightPdfFetch(url: string): Promise<{
  success: boolean;
  pdfSize?: number;
  error?: string;
  preview?: string;
}> {
  if (!isAllowedUrl(url)) {
    return { 
      success: false, 
      error: 'URL not allowed. Only Delhi court domains (dcourts.gov.in, ecourts.gov.in) are permitted.' 
    };
  }

  let context: BrowserContext | null = null;
  
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    console.log(`[Playwright Test] Fetching: ${url}`);
    
    const response = await page.goto(url, { 
      waitUntil: 'load', 
      timeout: 60000 
    });
    
    if (!response) {
      return { success: false, error: 'No response received' };
    }
    
    const httpStatus = response.status();
    const contentType = response.headers()['content-type'] || '';
    console.log(`[Playwright Test] Response: status=${httpStatus}, content-type=${contentType}`);
    
    const buffer = await response.body();
    const pdfBuffer = Buffer.from(buffer);
    
    const preview = pdfBuffer.slice(0, 100).toString('utf8');
    
    if (isValidPdf(pdfBuffer)) {
      console.log(`[Playwright Test] Valid PDF! Size: ${pdfBuffer.length} bytes`);
      return { 
        success: true, 
        pdfSize: pdfBuffer.length,
        preview: '%PDF-...'
      };
    } else {
      console.log(`[Playwright Test] Not a valid PDF. Preview: ${preview}`);
      return { 
        success: false, 
        error: 'Response is not a valid PDF',
        preview: preview.slice(0, 100)
      };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Playwright Test] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
