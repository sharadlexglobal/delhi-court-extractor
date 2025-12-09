import OpenAI from "openai";
import { storage } from "./storage";
import type { CnrOrder, InsertOrderMetadata, InsertBusinessEntity, InsertCaseEntityLink, InsertPersonLead } from "@shared/schema";

const API_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: API_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return openaiClient;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const isRetryable = 
        error instanceof Error && 
        (error.message.includes("timeout") || 
         error.message.includes("rate_limit") ||
         error.message.includes("503") ||
         error.message.includes("529") ||
         error.message.includes("overloaded"));
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`${operationName} attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

interface ClassificationResult {
  caseTitle: string | null;
  caseNumber: string | null;
  caseType: string | null;
  filingDate: string | null;
  petitionerNames: string | null;
  respondentNames: string | null;
  petitionerAdvocates: string | null;
  respondentAdvocates: string | null;
  judgeName: string | null;
  courtName: string | null;
  courtDesignation: string | null;
  statutoryProvisions: string | null;
  orderType: string | null;
  orderSummary: string | null;
  operativePortion: string | null;
  nextHearingDate: string | null;
  isSummonsOrder: boolean;
  isNoticeOrder: boolean;
  isFreshCaseAssignment: boolean;
  isFirstHearing: boolean;
  isFinalOrder: boolean;
  hasBusinessEntity: boolean;
  entityTypes: string | null;
  classificationConfidence: number;
  businessEntities: Array<{
    name: string;
    entityType: string;
    partyRole: "petitioner" | "respondent" | "third_party";
  }>;
  personLeads: Array<{
    name: string;
    partyRole: "petitioner" | "respondent" | "third_party";
    address: string | null;
  }>;
  freshCasePhrase: string | null;
}

const CLASSIFICATION_PROMPT = `You are a legal document analyzer specializing in Indian court orders. Analyze the following court order text and extract structured information.

Return a JSON object with the following fields:
{
  "caseTitle": "Full case title (e.g., 'ABC Pvt Ltd vs XYZ Company')",
  "caseNumber": "Case number if found",
  "caseType": "Type of case (civil, criminal, commercial, etc.)",
  "filingDate": "Filing date in YYYY-MM-DD format if found",
  "petitionerNames": "Names of petitioners/plaintiffs separated by commas",
  "respondentNames": "Names of respondents/defendants separated by commas",
  "petitionerAdvocates": "Advocates for petitioners",
  "respondentAdvocates": "Advocates for respondents",
  "judgeName": "Name of the judge",
  "courtName": "Name of the court",
  "courtDesignation": "Court designation (e.g., District Judge, Additional Sessions Judge)",
  "statutoryProvisions": "Legal provisions/sections mentioned",
  "orderType": "Type of order (interim, final, adjournment, summons, notice, etc.)",
  "orderSummary": "Brief summary of the order in 2-3 sentences",
  "operativePortion": "Key operative directions from the order",
  "nextHearingDate": "Next hearing date in YYYY-MM-DD format if mentioned",
  "isSummonsOrder": true if this order issues summons to any party,
  "isNoticeOrder": true if this order issues notice to any party,
  "isFreshCaseAssignment": true if this is initial case assignment/filing,
  "isFirstHearing": true if this appears to be the first hearing,
  "isFinalOrder": true if this is a final judgment/decree,
  "hasBusinessEntity": true if any business entities (companies, firms, LLPs) are mentioned,
  "entityTypes": "Types of entities found (Pvt Ltd, LLP, Partnership, Sole Proprietor, etc.)",
  "classificationConfidence": confidence score between 0 and 1,
  "businessEntities": [
    {
      "name": "Full business name as mentioned",
      "entityType": "Pvt Ltd, LLP, Partnership, Sole Proprietor, Public Ltd, etc.",
      "partyRole": "petitioner, respondent, or third_party"
    }
  ],
  "personLeads": [
    {
      "name": "Full name of individual person (NOT a business entity)",
      "partyRole": "petitioner, respondent, or third_party",
      "address": "Address if mentioned in the order, otherwise null"
    }
  ],
  "freshCasePhrase": "Exact phrase if found, like 'fresh case received, it be checked and registered' or similar"
}

Focus on identifying:
1. Business entities that could be potential leads (companies facing legal issues)
2. Summons and notice orders (these indicate active litigation opportunities)
3. Recovery/money suits (potential for debt collection services)
4. Fresh case assignments (new business opportunities)
5. IMPORTANT: Look for phrases like "fresh case received, it be checked and registered" which indicate new case assignments - set isFreshCaseAssignment to true and capture the exact phrase in freshCasePhrase
6. When isFreshCaseAssignment is true, extract individual PERSON names (NOT businesses) from respondent/defendant parties as personLeads - these are potential leads for legal services

If a field is not found in the text, use null for strings, false for booleans, and empty array [] for arrays.`;

export async function classifyOrderText(orderId: number, text: string): Promise<ClassificationResult | null> {
  const openai = getOpenAI();

  const truncatedText = text.length > 15000 ? text.substring(0, 15000) + "..." : text;

  try {
    const response = await withRetry(
      async () => openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: CLASSIFICATION_PROMPT },
          { role: "user", content: `Analyze this court order:\n\n${truncatedText}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      `Classification order ${orderId}`
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error(`No response content for order ${orderId}`);
      return null;
    }

    let result: ClassificationResult;
    try {
      result = JSON.parse(content) as ClassificationResult;
    } catch (parseError) {
      console.error(`JSON parse error for order ${orderId}:`, parseError);
      return null;
    }
    
    if (!result || typeof result !== "object") {
      console.error(`Invalid classification result for order ${orderId}`);
      return null;
    }
    
    return result;
  } catch (error) {
    console.error(`Error classifying order ${orderId} after retries:`, error);
    return null;
  }
}

function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function classifyOrdersForJob(
  jobId: number,
  orders: CnrOrder[]
): Promise<void> {
  await storage.updateProcessingJobStarted(jobId);

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const pdfText = await storage.getPdfTextByOrderId(order.id);
      if (!pdfText) {
        console.warn(`No PDF text found for order ${order.id}`);
        failed++;
        processed++;
        await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
        continue;
      }

      const textToClassify = pdfText.cleanedText || pdfText.rawText;
      const classification = await classifyOrderText(order.id, textToClassify);

      if (!classification) {
        failed++;
        processed++;
        await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
        continue;
      }

      const metadataInsert: InsertOrderMetadata = {
        cnrOrderId: order.id,
        caseTitle: classification.caseTitle,
        caseNumber: classification.caseNumber,
        caseType: classification.caseType,
        filingDate: classification.filingDate,
        petitionerNames: classification.petitionerNames,
        respondentNames: classification.respondentNames,
        petitionerAdvocates: classification.petitionerAdvocates,
        respondentAdvocates: classification.respondentAdvocates,
        judgeName: classification.judgeName,
        courtName: classification.courtName,
        courtDesignation: classification.courtDesignation,
        statutoryProvisions: classification.statutoryProvisions,
        orderType: classification.orderType,
        orderSummary: classification.orderSummary,
        operativePortion: classification.operativePortion,
        nextHearingDate: classification.nextHearingDate,
        isSummonsOrder: classification.isSummonsOrder,
        isNoticeOrder: classification.isNoticeOrder,
        isFreshCaseAssignment: classification.isFreshCaseAssignment,
        isFirstHearing: classification.isFirstHearing,
        isFinalOrder: classification.isFinalOrder,
        hasBusinessEntity: classification.hasBusinessEntity,
        entityTypes: classification.entityTypes,
        classificationConfidence: classification.classificationConfidence,
        llmModelUsed: "gpt-4o",
      };

      await storage.createOrderMetadata(metadataInsert);

      if (classification.businessEntities && Array.isArray(classification.businessEntities) && classification.businessEntities.length > 0) {
        for (const entity of classification.businessEntities) {
          if (!entity || typeof entity !== "object" || !entity.name || !entity.entityType) {
            console.warn(`Skipping invalid entity in order ${order.id}`);
            continue;
          }
          const normalizedName = normalizeEntityName(entity.name);
          
          const existingEntity = await storage.getBusinessEntityByNormalizedName(normalizedName);
          
          let entityId: number;
          if (existingEntity) {
            entityId = existingEntity.id;
          } else {
            const newEntity = await storage.createBusinessEntity({
              name: entity.name,
              nameNormalized: normalizedName,
              entityType: entity.entityType,
              enrichmentStatus: "pending",
            });
            entityId = newEntity.id;
          }

          await storage.createCaseEntityLink({
            cnrOrderId: order.id,
            entityId: entityId,
            partyRole: entity.partyRole,
            confidence: classification.classificationConfidence,
          });
        }
      }

      if (classification.isFreshCaseAssignment && classification.personLeads && Array.isArray(classification.personLeads) && classification.personLeads.length > 0) {
        for (const person of classification.personLeads) {
          if (!person || typeof person !== "object" || !person.name) {
            console.warn(`Skipping invalid person lead in order ${order.id}`);
            continue;
          }
          
          const personLead: InsertPersonLead = {
            cnrOrderId: order.id,
            name: person.name,
            nameNormalized: normalizeEntityName(person.name),
            partyRole: person.partyRole || "respondent",
            caseType: classification.caseType,
            caseNumber: classification.caseNumber,
            petitionerName: classification.petitionerNames,
            isFreshCase: true,
            freshCasePhrase: classification.freshCasePhrase,
            address: person.address,
            nextHearingDate: classification.nextHearingDate,
            courtName: classification.courtName,
            judgeName: classification.judgeName,
            confidence: classification.classificationConfidence,
          };
          
          await storage.createPersonLead(personLead);
        }
      }

      successful++;
      processed++;
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);

    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error);
      failed++;
      processed++;
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    }
  }

  const finalStatus = failed === orders.length ? "failed" : "completed";
  await storage.updateProcessingJobStatus(jobId, finalStatus);
}
