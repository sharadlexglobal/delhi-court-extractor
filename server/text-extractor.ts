import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import type { CnrOrder } from "@shared/schema";
import { Mistral } from "@mistralai/mistralai";

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
  const apiKey = process.env.MISTRAL_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      rawText: "",
      cleanedText: "",
      pageCount: 0,
      wordCount: 0,
      errorMessage: "MISTRAL_API_KEY is not configured",
    };
  }

  try {
    const pdfBuffer = await objectStorage.getPdfBuffer(pdfPath);
    const base64Pdf = pdfBuffer.toString("base64");
    
    console.log(`[Mistral OCR] Processing PDF: ${pdfPath} (${pdfBuffer.length} bytes)`);
    
    const client = new Mistral({ apiKey });
    
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: `data:application/pdf;base64,${base64Pdf}`,
      },
      includeImageBase64: false,
    });

    const pages = ocrResponse.pages || [];
    const pageCount = pages.length;
    
    const rawText = pages.map((page: any) => page.markdown || "").join("\n\n");
    const cleanedText = cleanText(rawText);
    const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

    console.log(`[Mistral OCR] Extracted ${pageCount} pages, ${wordCount} words from ${pdfPath}`);

    return {
      success: true,
      rawText,
      cleanedText,
      pageCount,
      wordCount,
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
    const errorMessage = error instanceof Error ? error.message : "Unknown extraction error";
    console.error(`[Mistral OCR] Error extracting text: ${errorMessage}`);
    return {
      success: false,
      rawText: "",
      cleanedText: "",
      pageCount: 0,
      wordCount: 0,
      errorMessage,
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
