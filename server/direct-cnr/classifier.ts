import OpenAI from 'openai';
import { db } from '../db';
import { directCnrOrders, directCnrSummaries, directCnrPdfTexts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DirectCnrOrder, DirectCnrSummary, InsertDirectCnrSummary } from '@shared/schema';

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
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("timeout") ||
          error.message.includes("rate_limit") ||
          error.message.includes("429") ||
          error.message.includes("503"));

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`${operationName} attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

interface DirectCnrClassificationResult {
  caseTitle: string | null;
  caseCategory: string | null;
  statutoryActName: string | null;
  orderType: string | null;
  orderSummary: string | null;
  operativePortion: string | null;
  nextHearingDate: string | null;
  isFinalOrder: boolean;
  isSummonsOrder: boolean;
  isNoticeOrder: boolean;
  preparationNotes: string | null;
  actionItems: string[];
  classificationConfidence: number;
}

const DIRECT_CNR_CLASSIFICATION_PROMPT = `You are a legal document analyzer for Indian Advocates. Analyze this court order and provide:

1. **Classification** - Identify case type, statutory act, and order type
2. **Summary** - Clear explanation of what happened in this order
3. **Advocate Preparation Guidance** - Specific preparation notes and action items for the advocate

## DELHI COURTS CASE CATEGORIES:
- MACT = Motor Accident Claims Tribunal (Motor Vehicles Act, 1988)
- NI_ACT = Negotiable Instruments Act, 1881 (Section 138 - Cheque Bounce)
- COMMERCIAL_COURTS = Commercial Courts Act, 2015
- IPC = Indian Penal Code, 1860
- CPC = Code of Civil Procedure, 1908
- CrPC = Code of Criminal Procedure, 1973
- POCSO = Protection of Children from Sexual Offences Act, 2012
- NDPS = Narcotic Drugs and Psychotropic Substances Act, 1985
- DV_ACT = Protection of Women from Domestic Violence Act, 2005
- ARBITRATION = Arbitration & Conciliation Act
- EXECUTION = Execution proceedings
- MAINTENANCE = Section 125 CrPC Maintenance
- OTHER = Other categories

Return a JSON object:
{
  "caseTitle": "Full case title (Petitioner vs Respondent)",
  "caseCategory": "Category code from above list",
  "statutoryActName": "Full act name with abbreviation (e.g., 'MACT - Motor Accident Claims Tribunal under Motor Vehicles Act, 1988')",
  "orderType": "Type: interim, final, adjournment, summons, notice, bail, stay, etc.",
  "orderSummary": "2-3 sentence summary explaining what happened and what the court decided",
  "operativePortion": "Key directions from the order - what must be done",
  "nextHearingDate": "Next hearing date in YYYY-MM-DD format if mentioned, else null",
  "isFinalOrder": true/false,
  "isSummonsOrder": true/false,
  "isNoticeOrder": true/false,
  "preparationNotes": "Detailed guidance for the advocate on how to prepare for the next hearing. Include:\n- What documents to gather\n- What arguments to prepare\n- What evidence might be needed\n- Any procedural steps to complete before next date",
  "actionItems": [
    "Specific action item 1 (e.g., 'File written statement by next date')",
    "Specific action item 2 (e.g., 'Collect payment receipts from client')",
    "Specific action item 3 (e.g., 'Prepare cross-examination questions for PW-1')"
  ],
  "classificationConfidence": 0.0 to 1.0
}

## PREPARATION NOTES GUIDELINES:
- Be specific to this case and order type
- Consider the stage of the case
- Include timeline awareness (if next hearing is soon, prioritize urgent tasks)
- Suggest relevant legal precedents if applicable
- Note any compliance deadlines mentioned in the order

If a field cannot be determined, use null for strings and empty array [] for arrays.`;

export async function classifyDirectCnrOrder(
  orderId: number,
  text: string
): Promise<DirectCnrClassificationResult | null> {
  const openai = getOpenAI();
  const truncatedText = text.length > 15000 ? text.substring(0, 15000) + "..." : text;

  try {
    const response = await withRetry(
      async () => openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: DIRECT_CNR_CLASSIFICATION_PROMPT },
          { role: "user", content: `Analyze this court order:\n\n${truncatedText}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      `DirectCNR Classification order ${orderId}`
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error(`[DirectCNR-Classifier] No response for order ${orderId}`);
      return null;
    }

    const result = JSON.parse(content) as DirectCnrClassificationResult;
    return result;
  } catch (error) {
    console.error(`[DirectCNR-Classifier] Error classifying order ${orderId}:`, error);
    return null;
  }
}

export async function classifyAndSaveOrder(order: DirectCnrOrder): Promise<boolean> {
  const [pdfText] = await db.select()
    .from(directCnrPdfTexts)
    .where(eq(directCnrPdfTexts.orderId, order.id))
    .limit(1);

  if (!pdfText) {
    console.warn(`[DirectCNR-Classifier] No text found for order ${order.id}`);
    return false;
  }

  const textToClassify = pdfText.cleanedText || pdfText.rawText;
  const result = await classifyDirectCnrOrder(order.id, textToClassify);

  if (!result) {
    return false;
  }

  const existingSummary = await db.select()
    .from(directCnrSummaries)
    .where(eq(directCnrSummaries.orderId, order.id))
    .limit(1);

  const summaryData: InsertDirectCnrSummary = {
    orderId: order.id,
    caseTitle: result.caseTitle,
    caseCategory: result.caseCategory,
    statutoryActName: result.statutoryActName,
    orderType: result.orderType,
    orderSummary: result.orderSummary,
    operativePortion: result.operativePortion,
    nextHearingDate: result.nextHearingDate,
    isFinalOrder: result.isFinalOrder,
    isSummonsOrder: result.isSummonsOrder,
    isNoticeOrder: result.isNoticeOrder,
    preparationNotes: result.preparationNotes,
    actionItems: JSON.stringify(result.actionItems),
    classificationConfidence: result.classificationConfidence,
    llmModelUsed: 'gpt-4o'
  };

  if (existingSummary.length > 0) {
    await db.update(directCnrSummaries)
      .set({
        ...summaryData,
        classifiedAt: new Date()
      })
      .where(eq(directCnrSummaries.orderId, order.id));
  } else {
    await db.insert(directCnrSummaries).values(summaryData);
  }

  await db.update(directCnrOrders)
    .set({
      classificationDone: true,
      summaryGenerated: true,
      updatedAt: new Date()
    })
    .where(eq(directCnrOrders.id, order.id));

  console.log(`[DirectCNR-Classifier] Order ${order.id} classified successfully`);
  return true;
}

export async function classifyAllOrdersForCase(caseId: number): Promise<{
  total: number;
  successful: number;
  failed: number;
}> {
  const orders = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId));

  const pendingOrders = orders.filter(o => o.textExtracted && !o.classificationDone);

  console.log(`[DirectCNR-Classifier] Classifying ${pendingOrders.length} orders for case ${caseId}`);

  let successful = 0;
  let failed = 0;

  for (const order of pendingOrders) {
    const success = await classifyAndSaveOrder(order);
    if (success) {
      successful++;
    } else {
      failed++;
    }
  }

  return { total: pendingOrders.length, successful, failed };
}

export async function getSummaryByOrderId(orderId: number): Promise<DirectCnrSummary | null> {
  const [summary] = await db.select()
    .from(directCnrSummaries)
    .where(eq(directCnrSummaries.orderId, orderId))
    .limit(1);
  return summary || null;
}
