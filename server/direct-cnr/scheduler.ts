import { db } from '../db';
import { directCnrCases, directCnrMonitoring, directCnrOrders, districts } from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import type { DirectCnrMonitoring, InsertDirectCnrMonitoring } from '@shared/schema';
import { extractCaseDetails } from './ecourts-extractor';
import { createOrdersFromECourtsData } from './order-generator';
import { downloadAllPdfsForCase } from './pdf-downloader';
import { extractTextForAllOrders } from './text-extractor';
import { classifyAllOrdersForCase } from './classifier';

const MONITORING_DURATION_DAYS = 30;

export async function createMonitoringSchedule(
  caseId: number,
  hearingDate: Date
): Promise<DirectCnrMonitoring | null> {
  const triggerDateStr = formatDateForDb(hearingDate);
  
  const startDate = new Date(hearingDate);
  startDate.setDate(startDate.getDate() + 1);

  const endDate = new Date(hearingDate);
  endDate.setDate(endDate.getDate() + MONITORING_DURATION_DAYS);

  // Check if ACTIVE schedule already exists for this case and trigger date
  const existingActiveSchedule = await db.select()
    .from(directCnrMonitoring)
    .where(
      and(
        eq(directCnrMonitoring.caseId, caseId),
        eq(directCnrMonitoring.triggerDate, triggerDateStr),
        eq(directCnrMonitoring.isActive, true)
      )
    )
    .limit(1);

  if (existingActiveSchedule.length > 0) {
    console.log(`[Scheduler] Active schedule already exists for case ${caseId} with trigger date ${triggerDateStr}`);
    return existingActiveSchedule[0];
  }

  // Check if inactive schedule exists - reactivate it instead of creating duplicate
  const existingInactiveSchedule = await db.select()
    .from(directCnrMonitoring)
    .where(
      and(
        eq(directCnrMonitoring.caseId, caseId),
        eq(directCnrMonitoring.triggerDate, triggerDateStr),
        eq(directCnrMonitoring.isActive, false)
      )
    )
    .limit(1);

  if (existingInactiveSchedule.length > 0) {
    // Reactivate the schedule with fresh dates and reset counters
    const [reactivated] = await db.update(directCnrMonitoring)
      .set({
        startMonitoringDate: formatDateForDb(startDate),
        endMonitoringDate: formatDateForDb(endDate),
        isActive: true,
        orderFound: false,
        foundOrderId: null,
        totalChecks: 0,
        lastCheckAt: null
      })
      .where(eq(directCnrMonitoring.id, existingInactiveSchedule[0].id))
      .returning();
    
    console.log(`[Scheduler] Reactivated existing schedule for case ${caseId}: ${formatDateForDb(startDate)} to ${formatDateForDb(endDate)}`);
    return reactivated;
  }

  // No existing schedule, create new one
  const [schedule] = await db.insert(directCnrMonitoring)
    .values({
      caseId,
      triggerDate: triggerDateStr,
      startMonitoringDate: formatDateForDb(startDate),
      endMonitoringDate: formatDateForDb(endDate),
      isActive: true
    })
    .returning();

  console.log(`[Scheduler] Created NEW monitoring schedule for case ${caseId}: ${formatDateForDb(startDate)} to ${formatDateForDb(endDate)}`);

  return schedule;
}

export async function getActiveMonitoringSchedules(): Promise<DirectCnrMonitoring[]> {
  const today = formatDateForDb(new Date());

  return db.select()
    .from(directCnrMonitoring)
    .where(
      and(
        eq(directCnrMonitoring.isActive, true),
        lte(directCnrMonitoring.startMonitoringDate, today),
        gte(directCnrMonitoring.endMonitoringDate, today)
      )
    );
}

export async function checkForNewOrders(scheduleId: number): Promise<{
  newOrdersFound: number;
  processed: boolean;
}> {
  const [schedule] = await db.select()
    .from(directCnrMonitoring)
    .where(eq(directCnrMonitoring.id, scheduleId))
    .limit(1);

  if (!schedule || !schedule.isActive) {
    return { newOrdersFound: 0, processed: false };
  }

  const [caseRecord] = await db.select()
    .from(directCnrCases)
    .where(eq(directCnrCases.id, schedule.caseId))
    .limit(1);

  if (!caseRecord) {
    return { newOrdersFound: 0, processed: false };
  }

  console.log(`[Scheduler] Checking for new orders for case ${caseRecord.cnr}`);

  try {
    const caseDetails = await extractCaseDetails(caseRecord.cnr);

    if (caseDetails.status !== 'success') {
      console.log(`[Scheduler] Could not extract case details: ${caseDetails.error}`);
      await updateScheduleCheck(scheduleId);
      return { newOrdersFound: 0, processed: true };
    }

    const existingOrders = await db.select()
      .from(directCnrOrders)
      .where(eq(directCnrOrders.caseId, caseRecord.id));

    const existingOrderKeys = new Set(
      existingOrders.map(o => `${o.orderNo}-${o.orderDate}`)
    );

    const newOrders = caseDetails.interimOrders.filter(order => {
      const parsedDate = parseOrderDate(order.orderDate);
      if (!parsedDate) return false;
      const key = `${order.orderNumber}-${formatDateForDb(parsedDate)}`;
      return !existingOrderKeys.has(key);
    });

    if (newOrders.length === 0) {
      console.log(`[Scheduler] No new orders found for case ${caseRecord.cnr}`);
      await updateScheduleCheck(scheduleId);
      return { newOrdersFound: 0, processed: true };
    }

    console.log(`[Scheduler] Found ${newOrders.length} new orders for case ${caseRecord.cnr}`);

    const [district] = await db.select()
      .from(districts)
      .where(eq(districts.id, caseRecord.districtId))
      .limit(1);

    const createdOrders = await createOrdersFromECourtsData(
      caseRecord.id,
      caseRecord.cnr,
      district?.baseUrl || '',
      newOrders.map(o => ({ ...o, orderDetails: null }))
    );

    if (createdOrders.length > 0) {
      await downloadAllPdfsForCase(caseRecord.id, caseRecord.cnr);
      await extractTextForAllOrders(caseRecord.id);
      await classifyAllOrdersForCase(caseRecord.id);

      const firstNewOrder = createdOrders[0];
      
      // Mark current schedule as complete (order found, stop searching)
      await db.update(directCnrMonitoring)
        .set({
          orderFound: true,
          foundOrderId: firstNewOrder.id,
          isActive: false,
          lastCheckAt: new Date()
        })
        .where(eq(directCnrMonitoring.id, scheduleId));

      console.log(`[Scheduler] Order found! Stopped monitoring for schedule ${scheduleId}`);

      // Get updated next hearing date from case details and create new schedule
      const newNextHearingDate = caseDetails.caseStatus?.nextHearingDate;
      if (newNextHearingDate) {
        const parsedNextDate = parseOrderDate(newNextHearingDate);
        if (parsedNextDate) {
          // Update case with new next hearing date
          await db.update(directCnrCases)
            .set({ 
              nextHearingDate: formatDateForDb(parsedNextDate),
              updatedAt: new Date()
            })
            .where(eq(directCnrCases.id, caseRecord.id));

          // Create new monitoring schedule from next hearing date
          const newSchedule = await createMonitoringSchedule(caseRecord.id, parsedNextDate);
          if (newSchedule) {
            console.log(`[Scheduler] Created new monitoring schedule from next hearing date: ${newNextHearingDate}`);
          }
        }
      }
    }

    return { newOrdersFound: createdOrders.length, processed: true };

  } catch (error) {
    console.error(`[Scheduler] Error checking for new orders:`, error);
    await updateScheduleCheck(scheduleId);
    return { newOrdersFound: 0, processed: true };
  }
}

async function updateScheduleCheck(scheduleId: number): Promise<void> {
  const [schedule] = await db.select()
    .from(directCnrMonitoring)
    .where(eq(directCnrMonitoring.id, scheduleId))
    .limit(1);

  if (schedule) {
    await db.update(directCnrMonitoring)
      .set({
        totalChecks: schedule.totalChecks + 1,
        lastCheckAt: new Date()
      })
      .where(eq(directCnrMonitoring.id, scheduleId));
  }
}

export async function expireOldSchedules(): Promise<number> {
  const today = formatDateForDb(new Date());

  const expired = await db.select()
    .from(directCnrMonitoring)
    .where(
      and(
        eq(directCnrMonitoring.isActive, true),
        lte(directCnrMonitoring.endMonitoringDate, today)
      )
    );

  for (const schedule of expired) {
    await db.update(directCnrMonitoring)
      .set({ isActive: false })
      .where(eq(directCnrMonitoring.id, schedule.id));
  }

  console.log(`[Scheduler] Expired ${expired.length} monitoring schedules`);
  return expired.length;
}

export async function runDailyMonitoringCheck(): Promise<{
  schedulesChecked: number;
  newOrdersFound: number;
}> {
  console.log(`[Scheduler] Starting daily monitoring check at ${new Date().toISOString()}`);

  await expireOldSchedules();

  const activeSchedules = await getActiveMonitoringSchedules();
  console.log(`[Scheduler] Found ${activeSchedules.length} active monitoring schedules`);

  let totalNewOrders = 0;

  for (const schedule of activeSchedules) {
    const result = await checkForNewOrders(schedule.id);
    totalNewOrders += result.newOrdersFound;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log(`[Scheduler] Daily check complete. Checked ${activeSchedules.length} schedules, found ${totalNewOrders} new orders`);

  return {
    schedulesChecked: activeSchedules.length,
    newOrdersFound: totalNewOrders
  };
}

function formatDateForDb(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseOrderDate(dateStr: string): Date | null {
  const formats = [
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  for (let i = 0; i < formats.length; i++) {
    const match = dateStr.match(formats[i]);
    if (match) {
      if (i === 2) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      }
    }
  }
  return null;
}
