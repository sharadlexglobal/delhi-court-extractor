import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { db } from '../db';
import { directCnrOrders, directCnrPdfTexts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DirectCnrOrder, DirectCnrPdfText, InsertDirectCnrPdfText } from '@shared/schema';
import { ObjectStorageService } from '../objectStorage';

export interface TextExtractionResult {
  success: boolean;
  rawText?: string;
  cleanedText?: string;
  pageCount?: number;
  wordCount?: number;
  error?: string;
}

function cleanText(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+$/gm, '')
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<TextExtractionResult> {
  try {
    const data = await pdfParse(pdfBuffer);

    const rawText = data.text;
    const cleanedText = cleanText(rawText);
    const pageCount = data.numpages;
    const wordCount = countWords(cleanedText);

    return {
      success: true,
      rawText,
      cleanedText,
      pageCount,
      wordCount
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DirectCNR-TextExtractor] Extraction error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function extractTextForOrder(order: DirectCnrOrder): Promise<TextExtractionResult> {
  if (!order.pdfPath) {
    return { success: false, error: 'No PDF path available' };
  }

  try {
    const objectStorageService = new ObjectStorageService();
    const pdfBuffer = await objectStorageService.getPdfBuffer(order.pdfPath);

    if (!pdfBuffer) {
      return { success: false, error: 'Could not retrieve PDF from storage' };
    }

    const result = await extractTextFromPdf(pdfBuffer);

    if (result.success && result.rawText) {
      const existingText = await db.select()
        .from(directCnrPdfTexts)
        .where(eq(directCnrPdfTexts.orderId, order.id))
        .limit(1);

      if (existingText.length > 0) {
        await db.update(directCnrPdfTexts)
          .set({
            rawText: result.rawText,
            cleanedText: result.cleanedText || null,
            pageCount: result.pageCount || null,
            wordCount: result.wordCount || null,
            extractedAt: new Date()
          })
          .where(eq(directCnrPdfTexts.orderId, order.id));
      } else {
        await db.insert(directCnrPdfTexts)
          .values({
            orderId: order.id,
            rawText: result.rawText,
            cleanedText: result.cleanedText || null,
            pageCount: result.pageCount || null,
            wordCount: result.wordCount || null
          });
      }

      await db.update(directCnrOrders)
        .set({
          textExtracted: true,
          updatedAt: new Date()
        })
        .where(eq(directCnrOrders.id, order.id));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

export async function extractTextForAllOrders(caseId: number): Promise<{
  total: number;
  successful: number;
  failed: number;
}> {
  const orders = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId));

  const pendingOrders = orders.filter(o => o.pdfExists && !o.textExtracted);

  console.log(`[DirectCNR-TextExtractor] Processing ${pendingOrders.length} orders for case ${caseId}`);

  let successful = 0;
  let failed = 0;

  for (const order of pendingOrders) {
    const result = await extractTextForOrder(order);
    if (result.success) {
      successful++;
      console.log(`[DirectCNR-TextExtractor] Order ${order.id}: ${result.wordCount} words extracted`);
    } else {
      failed++;
      console.error(`[DirectCNR-TextExtractor] Order ${order.id} failed: ${result.error}`);
    }
  }

  return { total: pendingOrders.length, successful, failed };
}

export async function getPdfTextByOrderId(orderId: number): Promise<DirectCnrPdfText | null> {
  const [text] = await db.select()
    .from(directCnrPdfTexts)
    .where(eq(directCnrPdfTexts.orderId, orderId))
    .limit(1);
  return text || null;
}
