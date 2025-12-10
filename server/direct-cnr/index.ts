export { directCnrRouter } from './routes';
export { extractCaseDetails, type CaseDetails } from './ecourts-extractor';
export { 
  parseCNR, 
  type ParsedCNR, 
  createAdvocate, 
  getAllAdvocates, 
  createCase, 
  getCaseByCnr, 
  getCaseById, 
  getAllCases,
  getCaseWithOrders
} from './case-manager';
export { 
  generateOrderUrl, 
  createOrdersFromECourtsData, 
  getOrdersByCase 
} from './order-generator';
export { downloadPdfWithZenRows, downloadAllPdfsForCase } from './pdf-downloader';
export { extractTextForOrder, extractTextForAllOrders } from './text-extractor';
export { classifyAndSaveOrder, classifyAllOrdersForCase, getSummaryByOrderId } from './classifier';
export { 
  createMonitoringSchedule, 
  getActiveMonitoringSchedules, 
  runDailyMonitoringCheck 
} from './scheduler';
export { checkAndSendDailyDigest, generateDailyDigest } from './daily-digest';

// Start daily digest scheduler - checks every 5 minutes for 7 AM IST
let digestSchedulerStarted = false;
export function startDailyDigestScheduler(): void {
  if (digestSchedulerStarted) return;
  digestSchedulerStarted = true;
  
  console.log('[DirectCNR] Starting daily digest scheduler (checks every 5 min for 7 AM IST)');
  
  // Check immediately on startup
  import('./daily-digest').then(m => m.checkAndSendDailyDigest()).catch(console.error);
  
  // Then check every 5 minutes
  setInterval(() => {
    import('./daily-digest').then(m => m.checkAndSendDailyDigest()).catch(console.error);
  }, 5 * 60 * 1000);
}
