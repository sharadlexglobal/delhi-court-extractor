import OpenAI from 'openai';
import { db } from '../db';
import { 
  directCnrCases, 
  directCnrOrders, 
  directCnrSummaries, 
  directCnrCaseRollups,
  type DirectCnrCaseRollup
} from '@shared/schema';
import { eq, asc } from 'drizzle-orm';

const API_TIMEOUT_MS = 120000;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: API_TIMEOUT_MS,
      maxRetries: 2,
    });
  }
  return openaiClient;
}

const MASTER_SUMMARY_PROMPT = `You are a senior legal analyst creating a comprehensive case summary for an Indian advocate. 
Analyze ALL the court orders provided and create a unified "bird's eye view" of the entire case.

Your analysis must include:

1. **CASE PROGRESSION SUMMARY**: A narrative overview of how the case has progressed from filing to current date.

2. **TIMELINE**: Create a structured timeline with key events:
   - Filing date and initial proceedings
   - Major hearings and what happened
   - Orders passed and their significance
   - Current status

3. **ADJOURNMENT ANALYSIS**:
   - Count how many times each party sought adjournment
   - Document reasons for each adjournment
   - Note when court/judge was unavailable (leave, training, holiday)
   - Calculate effective hearing vs adjournment ratio

4. **KEY MILESTONES**: List critical points in the case:
   - Evidence submitted/recorded
   - Arguments heard
   - Interim orders passed
   - Compliance status

5. **ADVOCATE BIRD'S EYE VIEW**: For the advocate, summarize:
   - Current stage of case
   - What has been accomplished
   - What remains to be done
   - Critical pending deadlines
   - Strategic observations

6. **CURRENT STATUS**:
   - Next hearing date
   - What is expected on next date
   - Pending compliances

Return a JSON object:
{
  "caseProgressionSummary": "Narrative summary of case progression (3-5 paragraphs)",
  "timeline": [
    {"date": "YYYY-MM-DD", "event": "Event description", "party": "petitioner/respondent/court/null", "significance": "high/medium/low"}
  ],
  "petitionerAdjournments": number,
  "respondentAdjournments": number,
  "courtAdjournments": number,
  "adjournmentDetails": [
    {"date": "YYYY-MM-DD", "party": "petitioner/respondent/court", "reason": "Reason for adjournment"}
  ],
  "keyMilestones": [
    {"date": "YYYY-MM-DD", "milestone": "Description", "completed": true/false}
  ],
  "advocateBirdEyeView": "Comprehensive summary for advocate (2-3 paragraphs)",
  "currentStage": "Current stage of proceedings (e.g., 'Arguments', 'Evidence', 'Written Statement')",
  "pendingActions": ["Action 1", "Action 2", "Action 3"]
}`;

interface OrderSummaryData {
  orderNo: number;
  orderDate: string | null;
  hearingDate: string | null;
  orderType: string | null;
  orderSummary: string | null;
  operativePortion: string | null;
  nextHearingDate: string | null;
}

export async function generateMasterSummary(caseId: number): Promise<DirectCnrCaseRollup | null> {
  const [caseRecord] = await db.select()
    .from(directCnrCases)
    .where(eq(directCnrCases.id, caseId))
    .limit(1);

  if (!caseRecord) {
    console.error(`[MasterSummary] Case ${caseId} not found`);
    return null;
  }

  const orders = await db.select({
    orderNo: directCnrOrders.orderNo,
    orderDate: directCnrOrders.orderDate,
    hearingDate: directCnrOrders.hearingDate,
  })
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId))
    .orderBy(asc(directCnrOrders.orderNo));

  const orderSummaries: OrderSummaryData[] = [];
  
  for (const order of orders) {
    const [summary] = await db.select({
      orderType: directCnrSummaries.orderType,
      orderSummary: directCnrSummaries.orderSummary,
      operativePortion: directCnrSummaries.operativePortion,
      nextHearingDate: directCnrSummaries.nextHearingDate,
    })
      .from(directCnrSummaries)
      .innerJoin(directCnrOrders, eq(directCnrSummaries.orderId, directCnrOrders.id))
      .where(eq(directCnrOrders.caseId, caseId))
      .limit(1);

    orderSummaries.push({
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      hearingDate: order.hearingDate,
      orderType: summary?.orderType || null,
      orderSummary: summary?.orderSummary || null,
      operativePortion: summary?.operativePortion || null,
      nextHearingDate: summary?.nextHearingDate || null,
    });
  }

  if (orderSummaries.length === 0) {
    console.warn(`[MasterSummary] No orders found for case ${caseId}`);
    return null;
  }

  const caseContext = `
CASE DETAILS:
- CNR: ${caseRecord.cnr}
- Case Type: ${caseRecord.caseType || 'Not specified'}
- Filing Date: ${caseRecord.filingDate || 'Unknown'}
- Registration Date: ${caseRecord.registrationDate || 'Unknown'}
- Petitioner: ${caseRecord.petitionerName || 'Unknown'}
- Respondent: ${caseRecord.respondentName || 'Unknown'}
- Current Next Hearing: ${caseRecord.nextHearingDate || 'Unknown'}
- Judge: ${caseRecord.judgeName || 'Unknown'}

ORDER SUMMARIES (${orderSummaries.length} orders):
${orderSummaries.map((o, i) => `
Order ${o.orderNo} (${o.orderDate || 'date unknown'}):
- Hearing Date: ${o.hearingDate || 'N/A'}
- Type: ${o.orderType || 'Unknown'}
- Summary: ${o.orderSummary || 'No summary'}
- Operative Portion: ${o.operativePortion || 'N/A'}
- Next Hearing: ${o.nextHearingDate || 'N/A'}
`).join('\n')}`;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: MASTER_SUMMARY_PROMPT },
        { role: "user", content: caseContext }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error(`[MasterSummary] No response from OpenAI for case ${caseId}`);
      return null;
    }

    const result = JSON.parse(content);

    const rollupData = {
      caseId,
      caseProgressionSummary: result.caseProgressionSummary || null,
      timelineJson: JSON.stringify(result.timeline || []),
      petitionerAdjournments: result.petitionerAdjournments || 0,
      respondentAdjournments: result.respondentAdjournments || 0,
      courtAdjournments: result.courtAdjournments || 0,
      adjournmentDetails: JSON.stringify(result.adjournmentDetails || []),
      advocateBirdEyeView: result.advocateBirdEyeView || null,
      keyMilestones: JSON.stringify(result.keyMilestones || []),
      currentStage: result.currentStage || null,
      pendingActions: JSON.stringify(result.pendingActions || []),
      ordersIncluded: orderSummaries.length,
      compilationModel: 'gpt-4o',
    };

    const [existingRollup] = await db.select()
      .from(directCnrCaseRollups)
      .where(eq(directCnrCaseRollups.caseId, caseId))
      .limit(1);

    if (existingRollup) {
      await db.update(directCnrCaseRollups)
        .set({
          ...rollupData,
          lastCompiledAt: new Date()
        })
        .where(eq(directCnrCaseRollups.caseId, caseId));
    } else {
      await db.insert(directCnrCaseRollups).values(rollupData);
    }

    const [updatedRollup] = await db.select()
      .from(directCnrCaseRollups)
      .where(eq(directCnrCaseRollups.caseId, caseId))
      .limit(1);

    console.log(`[MasterSummary] Generated master summary for case ${caseId} with ${orderSummaries.length} orders`);
    return updatedRollup || null;

  } catch (error) {
    console.error(`[MasterSummary] Error generating summary for case ${caseId}:`, error);
    return null;
  }
}

export async function getMasterSummary(caseId: number): Promise<DirectCnrCaseRollup | null> {
  const [rollup] = await db.select()
    .from(directCnrCaseRollups)
    .where(eq(directCnrCaseRollups.caseId, caseId))
    .limit(1);
  return rollup || null;
}
