import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  parseCNR,
  getDistrictByCode,
  createAdvocate,
  getAllAdvocates,
  createCase,
  getCaseByCnr,
  getCaseById,
  getAllCases,
  updateCaseDetails,
  markCaseDetailsExtracted,
  markInitialOrdersDownloaded,
  getCaseWithOrders,
  deactivateCase
} from './case-manager';
import { extractCaseDetails } from './ecourts-extractor';
import { createOrdersFromECourtsData, getOrdersByCase } from './order-generator';
import { downloadAllPdfsForCase, downloadPdfWithZenRows } from './pdf-downloader';
import { extractTextForAllOrders } from './text-extractor';
import { classifyAllOrdersForCase, getSummaryByOrderId } from './classifier';
import { createMonitoringSchedule, getActiveMonitoringSchedules, runDailyMonitoringCheck } from './scheduler';
import { db } from '../db';
import { directCnrSummaries, directCnrOrders, directCnrCases, directCnrCaseRollups } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { rateLimit, heavyOperationLimit, sanitizeErrorMessage, acquireSchedulerLock, releaseSchedulerLock } from './middleware';

export const directCnrRouter = Router();

directCnrRouter.use(rateLimit(60));

const createAdvocateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  barCouncilId: z.string().optional()
});

const registerCaseSchema = z.object({
  cnr: z.string().min(16).max(16),
  advocateId: z.number().optional()
});

const setPartySchema = z.object({
  representedParty: z.enum(['petitioner', 'respondent'])
});

directCnrRouter.get('/advocates', async (req: Request, res: Response) => {
  try {
    const advocates = await getAllAdvocates();
    res.json({ success: true, data: advocates });
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching advocates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch advocates' });
  }
});

directCnrRouter.post('/advocates', async (req: Request, res: Response) => {
  try {
    const data = createAdvocateSchema.parse(req.body);
    const advocate = await createAdvocate(data);
    res.json({ success: true, data: advocate });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    console.error('[DirectCNR-API] Error creating advocate:', error);
    res.status(500).json({ success: false, error: 'Failed to create advocate' });
  }
});

directCnrRouter.get('/cases', async (req: Request, res: Response) => {
  try {
    const advocateId = req.query.advocateId ? parseInt(req.query.advocateId as string) : undefined;
    const cases = await getAllCases(advocateId);
    res.json({ success: true, data: cases });
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching cases:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cases' });
  }
});

directCnrRouter.get('/cases/:id', async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    const result = await getCaseWithOrders(caseId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const ordersWithSummaries = await Promise.all(
      result.orders.map(async (order) => {
        const summary = await getSummaryByOrderId(order.id);
        return { ...order, summary };
      })
    );

    res.json({
      success: true,
      data: {
        ...result.case,
        orders: ordersWithSummaries
      }
    });
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching case:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch case' });
  }
});

// PDF Preview endpoint - Stream original PDF for viewing
directCnrRouter.get('/orders/:orderId/pdf', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    const [order] = await db.select()
      .from(directCnrOrders)
      .where(eq(directCnrOrders.id, orderId))
      .limit(1);
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    if (!order.pdfExists || !order.pdfPath) {
      return res.status(404).json({ success: false, error: 'PDF not available for this order' });
    }
    
    const { ObjectStorageService } = await import('../objectStorage');
    const objectStorageService = new ObjectStorageService();
    const file = await objectStorageService.getPdfFile(order.pdfPath);
    
    // Stream the PDF with appropriate headers for inline viewing
    const [metadata] = await file.getMetadata();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': metadata.size as string,
      'Content-Disposition': `inline; filename="${order.pdfPath.split('/').pop()}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    
    const stream = file.createReadStream();
    stream.on('error', (err) => {
      console.error('[DirectCNR-PDF] Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error streaming PDF' });
      }
    });
    stream.pipe(res);
    
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to fetch PDF' });
    }
  }
});

// Set represented party for perspective-aware AI analysis
directCnrRouter.post('/cases/:id/party', async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    const { representedParty } = setPartySchema.parse(req.body);
    
    const [existingCase] = await db.select()
      .from(directCnrCases)
      .where(eq(directCnrCases.id, caseId))
      .limit(1);
    
    if (!existingCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    
    // Update the case with the selected party perspective
    await db.update(directCnrCases)
      .set({
        representedParty,
        perspectiveSetAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(directCnrCases.id, caseId));
    
    console.log(`[DirectCNR-API] Set party perspective for case ${caseId}: ${representedParty}`);
    
    // Trigger background reclassification with new perspective
    // This runs async so user doesn't wait
    reclassifyWithPerspective(caseId, representedParty).catch(err => {
      console.error(`[DirectCNR-API] Background reclassification failed for case ${caseId}:`, err);
    });
    
    res.json({
      success: true,
      data: { representedParty },
      message: `Perspective set to ${representedParty}. AI analysis will be updated with this viewpoint.`
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    console.error('[DirectCNR-API] Error setting party:', error);
    res.status(500).json({ success: false, error: 'Failed to set party perspective' });
  }
});

// Helper function to reclassify orders with new perspective (runs in background)
async function reclassifyWithPerspective(caseId: number, perspective: string) {
  try {
    const { classifyAllOrdersForCase: reclassify } = await import('./classifier');
    await reclassify(caseId, perspective);
    console.log(`[DirectCNR-API] Reclassification complete for case ${caseId} with ${perspective} perspective`);
  } catch (error) {
    console.error(`[DirectCNR-API] Reclassification error:`, error);
    throw error;
  }
}

// Get master summary for a case
directCnrRouter.get('/cases/:id/summary', async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    const { getMasterSummary } = await import('./summary-generator');
    const summary = await getMasterSummary(caseId);
    
    if (!summary) {
      return res.status(404).json({ 
        success: false, 
        error: 'No master summary found. Generate one first.' 
      });
    }
    
    // Parse JSON fields for response
    res.json({
      success: true,
      data: {
        ...summary,
        timeline: summary.timelineJson ? JSON.parse(summary.timelineJson) : [],
        adjournmentDetails: summary.adjournmentDetails ? JSON.parse(summary.adjournmentDetails) : [],
        keyMilestones: summary.keyMilestones ? JSON.parse(summary.keyMilestones) : [],
        pendingActions: summary.pendingActions ? JSON.parse(summary.pendingActions) : [],
      }
    });
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching master summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch master summary' });
  }
});

// Generate/refresh master summary for a case
directCnrRouter.post('/cases/:id/summary/refresh', heavyOperationLimit, async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    
    const [caseRecord] = await db.select()
      .from(directCnrCases)
      .where(eq(directCnrCases.id, caseId))
      .limit(1);
    
    if (!caseRecord) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    
    console.log(`[DirectCNR-API] Generating master summary for case ${caseId}`);
    
    const { generateMasterSummary } = await import('./summary-generator');
    const summary = await generateMasterSummary(caseId);
    
    if (!summary) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to generate master summary. Ensure case has classified orders.' 
      });
    }
    
    res.json({
      success: true,
      data: {
        ...summary,
        timeline: summary.timelineJson ? JSON.parse(summary.timelineJson) : [],
        adjournmentDetails: summary.adjournmentDetails ? JSON.parse(summary.adjournmentDetails) : [],
        keyMilestones: summary.keyMilestones ? JSON.parse(summary.keyMilestones) : [],
        pendingActions: summary.pendingActions ? JSON.parse(summary.pendingActions) : [],
      },
      message: 'Master summary generated successfully'
    });
  } catch (error) {
    console.error('[DirectCNR-API] Error generating master summary:', error);
    res.status(500).json({ success: false, error: 'Failed to generate master summary' });
  }
});

directCnrRouter.post('/cases/register', async (req: Request, res: Response) => {
  try {
    const { cnr, advocateId } = registerCaseSchema.parse(req.body);

    const parsedCnr = parseCNR(cnr);
    if (!parsedCnr) {
      return res.status(400).json({
        success: false,
        error: 'Invalid CNR format. Must be 16 characters: DL + District Code + 01 + 6-digit serial + 4-digit year'
      });
    }

    const existingCase = await getCaseByCnr(parsedCnr.cnr);
    if (existingCase) {
      return res.status(400).json({
        success: false,
        error: 'Case already registered',
        data: existingCase
      });
    }

    const district = await getDistrictByCode(parsedCnr.districtCode);
    if (!district) {
      return res.status(400).json({
        success: false,
        error: `Unknown district code: ${parsedCnr.districtCode}`
      });
    }

    const newCase = await createCase({
      cnr: parsedCnr.cnr,
      districtId: district.id,
      advocateId: advocateId || null
    });

    res.json({
      success: true,
      data: newCase,
      message: 'Case registered. Use /cases/:id/extract to fetch details from eCourts.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    console.error('[DirectCNR-API] Error registering case:', error);
    res.status(500).json({ success: false, error: 'Failed to register case' });
  }
});

directCnrRouter.post('/cases/:id/extract', heavyOperationLimit, async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    const caseRecord = await getCaseById(caseId);

    if (!caseRecord) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    console.log(`[DirectCNR-API] Extracting details for CNR: ${caseRecord.cnr}`);

    const caseDetails = await extractCaseDetails(caseRecord.cnr);

    if (caseDetails.status !== 'success') {
      return res.status(400).json({
        success: false,
        error: caseDetails.error || 'Failed to extract case details'
      });
    }

    const sanitize = (val: string | null, maxLen: number = 1000): string | null => {
      if (!val || val.trim() === '') return null;
      const trimmed = val.trim();
      return trimmed.length > maxLen ? trimmed.substring(0, maxLen) : trimmed;
    };
    
    const parseDate = (val: string | null): string | null => {
      if (!val || val.trim() === '') return null;
      const trimmed = val.trim();
      const ddmmyyyy = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
      if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      const months: Record<string, string> = {
        january: '01', february: '02', march: '03', april: '04',
        may: '05', june: '06', july: '07', august: '08',
        september: '09', october: '10', november: '11', december: '12'
      };
      const textDate = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})$/i);
      if (textDate) {
        const [, day, monthName, year] = textDate;
        const monthNum = months[monthName.toLowerCase()];
        if (monthNum) {
          return `${year}-${monthNum}-${day.padStart(2, '0')}`;
        }
      }
      return null;
    };
    
    await updateCaseDetails(caseId, {
      caseType: sanitize(caseDetails.caseDetails.caseType, 100),
      filingNumber: sanitize(caseDetails.caseDetails.filingNumber, 100),
      filingDate: parseDate(caseDetails.caseDetails.filingDate),
      registrationNumber: sanitize(caseDetails.caseDetails.registrationNumber, 100),
      registrationDate: parseDate(caseDetails.caseDetails.registrationDate),
      petitionerName: sanitize(caseDetails.parties.petitioner.name),
      petitionerAdvocate: sanitize(caseDetails.parties.petitioner.advocate),
      respondentName: sanitize(caseDetails.parties.respondent.name),
      respondentAdvocate: sanitize(caseDetails.parties.respondent.advocate),
      firstHearingDate: parseDate(caseDetails.caseStatus.firstHearingDate),
      nextHearingDate: parseDate(caseDetails.caseStatus.nextHearingDate),
      caseStage: sanitize(caseDetails.caseStatus.caseStage, 200),
      courtName: sanitize(caseDetails.caseStatus.courtNumberAndJudge, 300)
    });

    await markCaseDetailsExtracted(caseId);

    const district = await getDistrictByCode(parseCNR(caseRecord.cnr)!.districtCode);
    const orders = await createOrdersFromECourtsData(
      caseId,
      caseRecord.cnr,
      district?.baseUrl || '',
      caseDetails.interimOrders
    );

    res.json({
      success: true,
      data: {
        caseDetails,
        ordersCreated: orders.length
      },
      message: `Extracted case details and found ${orders.length} orders. Use /cases/:id/process to download and classify.`
    });
  } catch (error) {
    console.error('[DirectCNR-API] Error extracting case details:', error);
    res.status(500).json({ success: false, error: 'Failed to extract case details' });
  }
});

directCnrRouter.post('/cases/:id/process', heavyOperationLimit, async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    const caseRecord = await getCaseById(caseId);

    if (!caseRecord) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    console.log(`[DirectCNR-API] Processing all orders for case ${caseId}`);

    const pdfResult = await downloadAllPdfsForCase(caseId, caseRecord.cnr);
    console.log(`[DirectCNR-API] PDF download: ${pdfResult.successful}/${pdfResult.total} successful`);

    const textResult = await extractTextForAllOrders(caseId);
    console.log(`[DirectCNR-API] Text extraction: ${textResult.successful}/${textResult.total} successful`);

    const classifyResult = await classifyAllOrdersForCase(caseId);
    console.log(`[DirectCNR-API] Classification: ${classifyResult.successful}/${classifyResult.total} successful`);

    await markInitialOrdersDownloaded(caseId);

    if (caseRecord.nextHearingDate) {
      const nextHearing = new Date(caseRecord.nextHearingDate);
      if (nextHearing > new Date()) {
        await createMonitoringSchedule(caseId, nextHearing);
      }
    }

    res.json({
      success: true,
      data: {
        pdfDownload: pdfResult,
        textExtraction: textResult,
        classification: classifyResult
      }
    });
  } catch (error) {
    console.error('[DirectCNR-API] Error processing case:', error);
    res.status(500).json({ success: false, error: 'Failed to process case' });
  }
});

directCnrRouter.get('/cases/:id/summaries', async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    const orders = await getOrdersByCase(caseId);

    const summaries = await Promise.all(
      orders.map(async (order) => {
        const summary = await getSummaryByOrderId(order.id);
        return {
          orderId: order.id,
          orderNo: order.orderNo,
          orderDate: order.orderDate,
          pdfExists: order.pdfExists,
          pdfPath: order.pdfPath,
          summary
        };
      })
    );

    res.json({ success: true, data: summaries });
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching summaries:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch summaries' });
  }
});

directCnrRouter.delete('/cases/:id', async (req: Request, res: Response) => {
  try {
    const caseId = parseInt(req.params.id);
    await deactivateCase(caseId);
    res.json({ success: true, message: 'Case deactivated' });
  } catch (error) {
    console.error('[DirectCNR-API] Error deactivating case:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate case' });
  }
});

directCnrRouter.get('/monitoring/active', async (req: Request, res: Response) => {
  try {
    const schedules = await getActiveMonitoringSchedules();
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('[DirectCNR-API] Error fetching monitoring schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monitoring schedules' });
  }
});

directCnrRouter.post('/monitoring/run', heavyOperationLimit, async (req: Request, res: Response) => {
  if (!acquireSchedulerLock()) {
    return res.status(409).json({ 
      success: false, 
      error: 'Monitoring check already in progress. Please try again later.' 
    });
  }

  try {
    const result = await runDailyMonitoringCheck();
    
    // Also check if daily digest should be sent
    const { checkAndSendDailyDigest } = await import('./daily-digest');
    checkAndSendDailyDigest().catch(err => {
      console.error('[DirectCNR-API] Daily digest error:', err);
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[DirectCNR-API] Error running monitoring check:', error);
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) });
  } finally {
    releaseSchedulerLock();
  }
});

// Manual trigger for daily digest (for testing)
directCnrRouter.post('/digest/send', heavyOperationLimit, async (req: Request, res: Response) => {
  try {
    const { generateDailyDigest } = await import('./daily-digest');
    const result = await generateDailyDigest();
    res.json({ success: result.success, data: result });
  } catch (error) {
    console.error('[DirectCNR-API] Error sending digest:', error);
    res.status(500).json({ success: false, error: 'Failed to send digest' });
  }
});

directCnrRouter.get('/validate-cnr/:cnr', async (req: Request, res: Response) => {
  try {
    const cnr = req.params.cnr;
    const parsed = parseCNR(cnr);

    if (!parsed) {
      return res.json({
        success: false,
        valid: false,
        error: 'Invalid CNR format'
      });
    }

    const district = await getDistrictByCode(parsed.districtCode);

    res.json({
      success: true,
      valid: true,
      data: {
        ...parsed,
        districtName: district ? 'Found' : 'Unknown',
        districtId: district?.id
      }
    });
  } catch (error) {
    console.error('[DirectCNR-API] Error validating CNR:', error);
    res.status(500).json({ success: false, error: 'Failed to validate CNR' });
  }
});
