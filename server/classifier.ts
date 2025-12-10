import OpenAI from "openai";
import { storage } from "./storage";
import type { CnrOrder, InsertOrderMetadata, InsertBusinessEntity, InsertCaseEntityLink, InsertPersonLead } from "@shared/schema";

const API_TIMEOUT_MS = 60000;
const MAX_RETRIES = 4;
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
         error.message.includes("429") ||
         error.message.includes("503") ||
         error.message.includes("529") ||
         error.message.includes("overloaded") ||
         (error as any).status === 429 ||
         (error as any).status === 503 ||
         (error as any).status === 529);
      
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
  caseCategory: string | null;
  filingDate: string | null;
  petitionerNames: string | null;
  respondentNames: string | null;
  petitionerAdvocates: string | null;
  respondentAdvocates: string | null;
  judgeName: string | null;
  courtName: string | null;
  courtDesignation: string | null;
  statutoryProvisions: string | null;
  statutoryActName: string | null;
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

const CLASSIFICATION_PROMPT = `You are a legal document analyzer specializing in Indian court orders from Delhi District Courts. Analyze the following court order text and extract structured information.

## DELHI COURTS CASE TYPE ABBREVIATIONS REFERENCE:
- MACT = Motor Accident Claims Tribunal (under Motor Vehicles Act, 1988)
- NI Act / Section 138 = Negotiable Instruments Act, 1881 (cheque bounce cases)
- Commercial Courts Act = Commercial Courts Act, 2015 (commercial disputes above specified value)
- IPC = Indian Penal Code, 1860 (criminal cases)
- CPC = Code of Civil Procedure, 1908 (civil procedure)
- CrPC = Code of Criminal Procedure, 1973 (criminal procedure)
- POCSO = Protection of Children from Sexual Offences Act, 2012
- NDPS = Narcotic Drugs and Psychotropic Substances Act, 1985
- SC/ST Act = Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989
- DV Act = Protection of Women from Domestic Violence Act, 2005
- FAO = First Appeal from Order
- RCA = Regular Civil Appeal
- CS = Civil Suit
- CC = Criminal Case / Calendar Case
- ARB = Arbitration & Conciliation Act
- IA = Interlocutory Application
- EA = Execution Application
- Section 125 CrPC = Maintenance applications
- Section 156(3) CrPC = Directing police to investigate

Return a JSON object with the following fields:
{
  "caseTitle": "Full case title (e.g., 'Ashok Kumar Vs. Keshav')",
  "caseNumber": "Case number (e.g., '1156/2025', 'Bail Matter No. 4276/2025')",
  "caseType": "Type of case (civil, criminal, commercial, motor_accident, cheque_bounce, family, etc.)",
  "caseCategory": "Category from: MACT, NI_ACT, COMMERCIAL_COURTS, IPC, CPC, CrPC, POCSO, NDPS, DV_ACT, ARBITRATION, EXECUTION, MAINTENANCE, OTHER",
  "filingDate": "Filing date in YYYY-MM-DD format if found",
  "petitionerNames": "Names of petitioners/plaintiffs separated by commas",
  "respondentNames": "Names of respondents/defendants separated by commas",
  "petitionerAdvocates": "Advocates for petitioners",
  "respondentAdvocates": "Advocates for respondents",
  "judgeName": "Name of the judge",
  "courtName": "Name of the court (e.g., 'MACT-01, West/THC/Delhi')",
  "courtDesignation": "Court designation (e.g., 'District Judge', 'Additional Sessions Judge', 'DJ-cum-PO')",
  "statutoryProvisions": "Legal provisions/sections mentioned (e.g., 'Section 138 NI Act', 'Section 302 IPC')",
  "statutoryActName": "Full statutory act name with abbreviation (e.g., 'MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988', 'NI Act - Negotiable Instruments Act, 1881 (Section 138 - Cheque Dishonour)')",
  "orderType": "Type of order (interim, final, adjournment, summons, notice, bail, registration, etc.)",
  "orderSummary": "Brief summary in 2-3 sentences explaining what happened in the order and what the court decided",
  "operativePortion": "Key operative directions from the order (what the court ordered to be done)",
  "nextHearingDate": "Next hearing date in YYYY-MM-DD format if mentioned",
  "isSummonsOrder": true if this order issues summons to any party,
  "isNoticeOrder": true if this order issues notice to any party,
  "isFreshCaseAssignment": true if this appears to be a new case registration/assignment,
  "isFirstHearing": true if this appears to be the first hearing,
  "isFinalOrder": true if this is a final judgment/decree,
  "hasBusinessEntity": true if any business entities (companies, firms, LLPs) are mentioned,
  "entityTypes": "Types of entities found (Pvt Ltd, LLP, Partnership, Sole Proprietor, etc.)",
  "classificationConfidence": confidence score between 0 and 1,
  "businessEntities": [
    {
      "name": "Full business name exactly as mentioned in document",
      "entityType": "Pvt Ltd | LLP | Partnership | Sole Proprietor | Public Ltd | Trust | Society | HUF | Government",
      "partyRole": "petitioner | respondent | third_party"
    }
  ],
  "personLeads": [
    {
      "name": "Full name of individual person (NOT a business entity)",
      "partyRole": "petitioner, respondent, or third_party",
      "address": "Address if mentioned in the order, otherwise null"
    }
  ],
  "freshCasePhrase": "Exact phrase that indicates fresh case assignment"
}

## CRITICAL RULES:

1. **FRESH CASE DETECTION**: Set isFreshCaseAssignment=true if the order contains phrases SIMILAR IN MEANING to:
   - "fresh case received, it be checked and registered"
   - "case received and registered"
   - "FAR received, it be checked and registered"
   - "new case filed"
   - "case is registered"
   - "matter is registered"
   Capture the EXACT phrase found in freshCasePhrase field.

2. **STATUTORY ACT IDENTIFICATION**: Based on court name and order content, identify the applicable statutory act:
   - If court mentions "MACT" → "MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988"
   - If mentions Section 138 or cheque → "NI Act - Negotiable Instruments Act, 1881 (Section 138 - Cheque Dishonour)"
   - If criminal case with IPC sections → "IPC - Indian Penal Code, 1860"
   - If maintenance case → "CrPC - Code of Criminal Procedure, 1973 (Section 125 - Maintenance)"

3. **ORDER SUMMARY**: Write a clear, readable summary explaining:
   - What type of case this is
   - What happened in this order
   - What the court decided or ordered
   - Who was present/absent

4. **BUSINESS ENTITY DETECTION** - Extract ALL business/company names from the document:

   **DEFINITELY A BUSINESS if name contains:**
   - Legal suffixes: Pvt Ltd, Private Limited, Ltd, Limited, LLP, OPC, Inc, Corp, Co., Company
   - Business words: Enterprises, Industries, Traders, Trading, Exports, Imports, Merchants, Suppliers, Distributors, Dealers, Solutions, Services, Consultants, Associates, Manufacturing, Manufacturers, Works, Factory, Pharma, Construction, Builders, Developers, Properties, Realty, Store, Mart, Hotels, Restaurant, Tech, Technologies, Infotech, Finance, Financiers, Jewellers, Textiles, Motors, Transport, Logistics
   - Family patterns: & Sons, & Brothers, Bros, & Co, & Associates

   **INDIAN BUSINESS NAMING EXAMPLES:**
   - "Gupta Enterprises", "Agarwal Traders", "Singh Motors", "Patel Industries"
   - "Sri Lakshmi Industries", "Shri Balaji Enterprises" 
   - "Shah & Co", "Bose Brothers", "Sharma & Sons"
   - "ABC Pvt Ltd", "XYZ LLP", "DEF Trading Company"

   **NOT A BUSINESS (Individual person) if:**
   - Has S/o, D/o, W/o (Son of, Daughter of, Wife of)
   - Simple personal name like "Rajesh Kumar", "Sunita Devi"
   - Has title: Shri, Smt, Mr, Mrs, Ms, Dr followed by personal name only

   **Entity Types:** Pvt Ltd, LLP, Partnership, Sole Proprietor, Public Ltd, Trust, Society, HUF, Government

5. **PERSON LEADS**: For fresh cases, extract individual person names from respondent/defendant side as potential leads.

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
        caseCategory: classification.caseCategory,
        filingDate: classification.filingDate,
        petitionerNames: classification.petitionerNames,
        respondentNames: classification.respondentNames,
        petitionerAdvocates: classification.petitionerAdvocates,
        respondentAdvocates: classification.respondentAdvocates,
        judgeName: classification.judgeName,
        courtName: classification.courtName,
        courtDesignation: classification.courtDesignation,
        statutoryProvisions: classification.statutoryProvisions,
        statutoryActName: classification.statutoryActName,
        orderType: classification.orderType,
        orderSummary: classification.orderSummary,
        freshCasePhrase: classification.freshCasePhrase,
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
            console.log(`[Business Lead] Created: ${entity.name} (${entity.entityType})`);
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
