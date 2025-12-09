import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import type { CnrOrder } from "@shared/schema";

const objectStorage = new ObjectStorageService();

export interface ExtractionResult {
  success: boolean;
  rawText: string;
  cleanedText: string;
  pageCount: number;
  wordCount: number;
  errorMessage?: string;
}

function cleanText(text: string): string {
  let cleaned = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

export async function extractTextFromPdf(pdfPath: string): Promise<ExtractionResult> {
  try {
    const pdfBuffer = await objectStorage.getPdfBuffer(pdfPath);

    const pdfParseModule = await import("pdf-parse") as unknown as { default?: (buffer: Buffer) => Promise<{ text: string; numpages: number }> } | ((buffer: Buffer) => Promise<{ text: string; numpages: number }>);
    const pdfParse = typeof pdfParseModule === "function" ? pdfParseModule : (pdfParseModule as { default: (buffer: Buffer) => Promise<{ text: string; numpages: number }> }).default;
    const data = await pdfParse(pdfBuffer);

    const rawText = data.text;
    const cleanedText = cleanText(rawText);

    return {
      success: true,
      rawText,
      cleanedText,
      pageCount: data.numpages,
      wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
    };
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return {
        success: false,
        rawText: "",
        cleanedText: "",
        pageCount: 0,
        wordCount: 0,
        errorMessage: `PDF not found in Object Storage: ${pdfPath}`,
      };
    }
    return {
      success: false,
      rawText: "",
      cleanedText: "",
      pageCount: 0,
      wordCount: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown extraction error",
    };
  }
}

export async function extractTextsForJob(jobId: number, orders: CnrOrder[]): Promise<void> {
  await storage.updateProcessingJobStarted(jobId);

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      if (!order.pdfPath) {
        processed++;
        failed++;
        await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
        continue;
      }

      const result = await extractTextFromPdf(order.pdfPath);
      processed++;

      if (result.success && result.rawText.length > 0) {
        await storage.createPdfText({
          cnrOrderId: order.id,
          rawText: result.rawText,
          cleanedText: result.cleanedText,
          pageCount: result.pageCount,
          wordCount: result.wordCount,
        });
        successful++;
      } else {
        failed++;
        console.error(`Failed to extract text from order ${order.id}: ${result.errorMessage}`);
      }

      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    } catch (error) {
      failed++;
      console.error(`Error processing order ${order.id}:`, error);
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    }
  }

  const finalStatus = failed === orders.length ? "failed" : "completed";
  await storage.updateProcessingJobStatus(jobId, finalStatus);
}
