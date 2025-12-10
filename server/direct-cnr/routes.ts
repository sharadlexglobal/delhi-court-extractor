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
import { directCnrSummaries, directCnrOrders } from '@shared/schema';
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

    await updateCaseDetails(caseId, {
      caseType: caseDetails.caseDetails.caseType,
      filingNumber: caseDetails.caseDetails.filingNumber,
      filingDate: caseDetails.caseDetails.filingDate,
      registrationNumber: caseDetails.caseDetails.registrationNumber,
      registrationDate: caseDetails.caseDetails.registrationDate,
      petitionerName: caseDetails.parties.petitioner.name,
      petitionerAdvocate: caseDetails.parties.petitioner.advocate,
      respondentName: caseDetails.parties.respondent.name,
      respondentAdvocate: caseDetails.parties.respondent.advocate,
      firstHearingDate: caseDetails.caseStatus.firstHearingDate,
      nextHearingDate: caseDetails.caseStatus.nextHearingDate,
      caseStage: caseDetails.caseStatus.caseStage,
      courtName: caseDetails.caseStatus.courtNumberAndJudge
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
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[DirectCNR-API] Error running monitoring check:', error);
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) });
  } finally {
    releaseSchedulerLock();
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
