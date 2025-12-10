import OpenAI from 'openai';
import { db } from '../db';
import { directCnrOrders, directCnrSummaries, directCnrPdfTexts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DirectCnrOrder, DirectCnrSummary, InsertDirectCnrSummary } from '@shared/schema';
import { z } from 'zod';

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

const classificationResultSchema = z.object({
  caseTitle: z.string().nullable().default(null),
  caseCategory: z.string().nullable().default(null),
  statutoryActName: z.string().nullable().default(null),
  orderType: z.string().nullable().default(null),
  orderSummary: z.string().nullable().default(null),
  operativePortion: z.string().nullable().default(null),
  nextHearingDate: z.string().nullable().default(null),
  isFinalOrder: z.boolean().default(false),
  isSummonsOrder: z.boolean().default(false),
  isNoticeOrder: z.boolean().default(false),
  preparationNotes: z.string().nullable().default(null),
  actionItems: z.array(z.string()).default([]),
  classificationConfidence: z.number().min(0).max(1).default(0.5)
});

type DirectCnrClassificationResult = z.infer<typeof classificationResultSchema>;

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

function getPerspectivePromptAddition(perspective: string | null): string {
  if (!perspective) return '';
  
  const partyName = perspective === 'petitioner' ? 'PETITIONER' : 'RESPONDENT';
  const oppositeParty = perspective === 'petitioner' ? 'respondent' : 'petitioner';
  
  return `

## IMPORTANT: ADVOCATE PERSPECTIVE
You are analyzing this order from the perspective of the advocate representing the **${partyName}**.

In your analysis, specifically consider:
1. **Strategic Position**: How does this order affect the ${perspective}'s position in the case?
2. **Opportunities**: What opportunities does this order create for the ${perspective}?
3. **Risks**: What risks or adverse points exist that the ${perspective} should address?
4. **Counter-Strategy**: What might the ${oppositeParty} argue, and how should the ${perspective} prepare to counter?
5. **Next Steps**: What specific actions should the ${perspective}'s advocate take?

Frame all preparation notes and action items from the ${perspective}'s advocate's perspective.
- Focus on strengthening the ${perspective}'s case
- Identify weaknesses in the ${oppositeParty}'s position
- Suggest legal arguments favorable to the ${perspective}
- Recommend evidence gathering that supports the ${perspective}'s claims`;
}

export async function classifyDirectCnrOrder(
  orderId: number,
  text: string,
  perspective?: string | null
): Promise<DirectCnrClassificationResult | null> {
  const openai = getOpenAI();
  const truncatedText = text.length > 15000 ? text.substring(0, 15000) + "..." : text;
  const perspectiveAddition = getPerspectivePromptAddition(perspective || null);
  const fullPrompt = DIRECT_CNR_CLASSIFICATION_PROMPT + perspectiveAddition;

  try {
    const response = await withRetry(
      async () => openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: fullPrompt },
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

    const rawResult = JSON.parse(content);
    const validationResult = classificationResultSchema.safeParse(rawResult);
    
    if (!validationResult.success) {
      console.error(`[DirectCNR-Classifier] Invalid response format for order ${orderId}:`, validationResult.error.errors);
      return classificationResultSchema.parse({});
    }
    
    return validationResult.data;
  } catch (error) {
    console.error(`[DirectCNR-Classifier] Error classifying order ${orderId}:`, error);
    return null;
  }
}

export async function classifyAndSaveOrder(order: DirectCnrOrder, perspective?: string | null): Promise<boolean> {
  const [pdfText] = await db.select()
    .from(directCnrPdfTexts)
    .where(eq(directCnrPdfTexts.orderId, order.id))
    .limit(1);

  if (!pdfText) {
    console.warn(`[DirectCNR-Classifier] No text found for order ${order.id}`);
    return false;
  }

  const textToClassify = pdfText.cleanedText || pdfText.rawText;
  const result = await classifyDirectCnrOrder(order.id, textToClassify, perspective);

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

export async function classifyAllOrdersForCase(caseId: number, perspective?: string | null): Promise<{
  total: number;
  successful: number;
  failed: number;
}> {
  const orders = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId));

  // If perspective is provided, reclassify ALL orders (for perspective change)
  // Otherwise, only classify pending orders
  const ordersToClassify = perspective 
    ? orders.filter(o => o.textExtracted) 
    : orders.filter(o => o.textExtracted && !o.classificationDone);

  const action = perspective ? 'Reclassifying with perspective' : 'Classifying';
  console.log(`[DirectCNR-Classifier] ${action} ${ordersToClassify.length} orders for case ${caseId}${perspective ? ` (${perspective})` : ''}`);

  let successful = 0;
  let failed = 0;

  for (const order of ordersToClassify) {
    const success = await classifyAndSaveOrder(order, perspective);
    if (success) {
      successful++;
    } else {
      failed++;
    }
  }

  return { total: ordersToClassify.length, successful, failed };
}

export async function getSummaryByOrderId(orderId: number): Promise<DirectCnrSummary | null> {
  const [summary] = await db.select()
    .from(directCnrSummaries)
    .where(eq(directCnrSummaries.orderId, orderId))
    .limit(1);
  return summary || null;
}
