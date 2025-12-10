import axios from 'axios';
import { db } from '../db';
import { directCnrOrders } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DirectCnrOrder } from '@shared/schema';
import { ObjectStorageService } from '../objectStorage';

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

export interface PdfDownloadResult {
  success: boolean;
  pdfPath?: string;
  pdfSize?: number;
  error?: string;
  httpStatus?: number;
}

export async function downloadPdfWithZenRows(
  order: DirectCnrOrder,
  cnr: string
): Promise<PdfDownloadResult> {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ZENROWS_API_KEY not configured' };
  }

  if (!isAllowedUrl(order.url)) {
    console.error(`[DirectCNR-PDF] URL not allowed: ${order.url}`);
    return {
      success: false,
      error: 'URL not allowed. Only Delhi court domains are permitted.'
    };
  }

  try {
    console.log(`[DirectCNR-PDF] Downloading PDF for order ${order.id}: ${order.url}`);

    const response = await axios.get('https://api.zenrows.com/v1/', {
      params: {
        url: order.url,
        apikey: apiKey,
        premium_proxy: 'true',
        js_render: 'true',
        proxy_country: 'in',
      },
      responseType: 'arraybuffer',
      timeout: 90000,
    });

    const httpStatus = response.status;
    const buffer = Buffer.from(response.data);

    console.log(`[DirectCNR-PDF] Response: status=${httpStatus}, size=${buffer.length} bytes`);

    if (!isValidPdf(buffer)) {
      const preview = buffer.slice(0, 200).toString('utf8');
      console.log(`[DirectCNR-PDF] Invalid PDF header. Preview: ${preview.slice(0, 100)}`);

      if (preview.includes('No record found') || preview.includes('error')) {
        return {
          success: false,
          error: 'No record found',
          httpStatus
        };
      }

      return {
        success: false,
        error: `Invalid PDF: ${preview.slice(0, 50)}`,
        httpStatus
      };
    }

    if (buffer.length < 1000) {
      return {
        success: false,
        error: "PDF too small (likely error page)",
        httpStatus
      };
    }

    const objectStorageService = new ObjectStorageService();
    const pdfPath = await objectStorageService.storePdf(buffer, cnr, order.orderNo);

    console.log(`[DirectCNR-PDF] PDF saved: ${pdfPath} (${buffer.length} bytes)`);

    await db.update(directCnrOrders)
      .set({
        pdfExists: true,
        pdfPath,
        pdfSizeBytes: buffer.length,
        httpStatusCode: httpStatus,
        errorMessage: null,
        lastAttemptAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(directCnrOrders.id, order.id));

    return {
      success: true,
      pdfPath,
      pdfSize: buffer.length,
      httpStatus
    };

  } catch (error) {
    let errorMessage = 'Unknown error';
    let httpStatus: number | undefined;

    if (axios.isAxiosError(error)) {
      httpStatus = error.response?.status;
      const data = error.response?.data;
      const preview = data ? Buffer.from(data).slice(0, 100).toString('utf8') : '';
      errorMessage = `HTTP ${httpStatus}: ${error.message}. Preview: ${preview}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error(`[DirectCNR-PDF] Download error for order ${order.id}:`, errorMessage);

    const [currentOrder] = await db.select()
      .from(directCnrOrders)
      .where(eq(directCnrOrders.id, order.id))
      .limit(1);

    await db.update(directCnrOrders)
      .set({
        pdfExists: false,
        httpStatusCode: httpStatus || null,
        errorMessage,
        retryCount: (currentOrder?.retryCount || 0) + 1,
        lastAttemptAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(directCnrOrders.id, order.id));

    return { success: false, error: errorMessage, httpStatus };
  }
}

export async function downloadAllPdfsForCase(
  caseId: number,
  cnr: string
): Promise<{ total: number; successful: number; failed: number }> {
  const orders = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId));

  const pendingOrders = orders.filter(o => !o.pdfExists && o.retryCount < 3);

  console.log(`[DirectCNR-PDF] Downloading ${pendingOrders.length} PDFs for case ${caseId}`);

  let successful = 0;
  let failed = 0;

  for (const order of pendingOrders) {
    const result = await downloadPdfWithZenRows(order, cnr);
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { total: pendingOrders.length, successful, failed };
}
