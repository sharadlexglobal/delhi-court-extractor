// Daily Digest Scheduler for Direct CNR
// Sends case summaries at 7 AM IST daily

import { db } from '../db';
import { directCnrCases, directCnrCaseRollups, directCnrDailyDigests } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { sendEmail, isGmailConnected } from './gmail-client';

const DIGEST_RECIPIENT = 'hello@sharadbansal.com';
const IST_OFFSET_HOURS = 5.5; // IST is UTC+5:30

interface CaseSummaryForDigest {
  cnr: string;
  caseType: string | null;
  petitionerName: string | null;
  respondentName: string | null;
  nextHearingDate: string | null;
  currentStage: string | null;
  pendingActions: string[];
  advocateBirdEyeView: string | null;
}

function getISTDate(): Date {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (IST_OFFSET_HOURS * 3600000));
}

function formatDateIST(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function generateDailyDigest(): Promise<{
  success: boolean;
  casesIncluded: number;
  message: string;
}> {
  const today = formatDateIST(getISTDate());
  
  // Check if digest already exists for today (any status)
  const [existingDigest] = await db.select()
    .from(directCnrDailyDigests)
    .where(and(
      eq(directCnrDailyDigests.runDate, today),
      eq(directCnrDailyDigests.recipientEmail, DIGEST_RECIPIENT)
    ))
    .limit(1);

  // If already sent successfully, skip
  if (existingDigest?.sentAt) {
    console.log(`[DailyDigest] Already sent digest for ${today}`);
    return { success: true, casesIncluded: 0, message: 'Digest already sent today' };
  }

  // Check Gmail connection
  const gmailConnected = await isGmailConnected();
  if (!gmailConnected) {
    console.error('[DailyDigest] Gmail not connected');
    return { success: false, casesIncluded: 0, message: 'Gmail not connected' };
  }

  // Get all active cases with rollups
  const cases = await db.select({
    cnr: directCnrCases.cnr,
    caseType: directCnrCases.caseType,
    petitionerName: directCnrCases.petitionerName,
    respondentName: directCnrCases.respondentName,
    nextHearingDate: directCnrCases.nextHearingDate,
    rollup: directCnrCaseRollups,
  })
    .from(directCnrCases)
    .leftJoin(directCnrCaseRollups, eq(directCnrCases.id, directCnrCaseRollups.caseId))
    .where(eq(directCnrCases.isActive, true));

  if (cases.length === 0) {
    console.log('[DailyDigest] No active cases to include in digest');
    return { success: true, casesIncluded: 0, message: 'No active cases' };
  }

  const caseSummaries: CaseSummaryForDigest[] = cases.map(c => ({
    cnr: c.cnr,
    caseType: c.caseType,
    petitionerName: c.petitionerName,
    respondentName: c.respondentName,
    nextHearingDate: c.nextHearingDate,
    currentStage: c.rollup?.currentStage || null,
    pendingActions: c.rollup?.pendingActions ? JSON.parse(c.rollup.pendingActions) : [],
    advocateBirdEyeView: c.rollup?.advocateBirdEyeView || null,
  }));

  // Generate HTML email with sanitization
  const htmlBody = generateDigestHtml(caseSummaries, today);

  // Send email
  const emailSent = await sendEmail({
    to: DIGEST_RECIPIENT,
    subject: `[Delhi Courts] Daily Case Digest - ${today}`,
    htmlBody,
  });

  // Upsert digest record - update if exists, insert if not
  if (existingDigest) {
    await db.update(directCnrDailyDigests)
      .set({
        casesIncluded: caseSummaries.length,
        digestPayload: JSON.stringify(caseSummaries),
        sentAt: emailSent ? new Date() : null,
        deliveryStatus: emailSent ? 'sent' : 'failed',
        errorMessage: emailSent ? null : 'Failed to send email',
      })
      .where(eq(directCnrDailyDigests.id, existingDigest.id));
  } else {
    await db.insert(directCnrDailyDigests).values({
      runDate: today,
      recipientEmail: DIGEST_RECIPIENT,
      casesIncluded: caseSummaries.length,
      digestPayload: JSON.stringify(caseSummaries),
      sentAt: emailSent ? new Date() : null,
      deliveryStatus: emailSent ? 'sent' : 'failed',
      errorMessage: emailSent ? null : 'Failed to send email',
    });
  }

  console.log(`[DailyDigest] ${emailSent ? 'Sent' : 'Failed'} digest with ${caseSummaries.length} cases`);
  
  return {
    success: emailSent,
    casesIncluded: caseSummaries.length,
    message: emailSent ? 'Digest sent successfully' : 'Failed to send digest',
  };
}

// Basic HTML sanitization
function escapeHtml(text: string | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateDigestHtml(cases: CaseSummaryForDigest[], date: string): string {
  const caseRows = cases.map(c => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; font-family: monospace; font-size: 12px; color: #1a365d;">${escapeHtml(c.cnr)}</td>
      <td style="padding: 12px;">
        <strong>${escapeHtml(c.petitionerName) || 'Unknown'}</strong> vs <strong>${escapeHtml(c.respondentName) || 'Unknown'}</strong>
        ${c.caseType ? `<br><span style="color: #666; font-size: 12px;">${escapeHtml(c.caseType)}</span>` : ''}
      </td>
      <td style="padding: 12px; text-align: center;">
        ${c.nextHearingDate 
          ? `<span style="background: #fef3cd; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(c.nextHearingDate)}</span>`
          : '<span style="color: #999;">-</span>'}
      </td>
      <td style="padding: 12px;">
        ${c.currentStage 
          ? `<span style="background: #e8f4fd; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(c.currentStage)}</span>`
          : '-'}
      </td>
    </tr>
    ${c.pendingActions.length > 0 ? `
    <tr style="background: #f8f9fa;">
      <td colspan="4" style="padding: 8px 12px;">
        <strong style="font-size: 12px; color: #856404;">Action Items:</strong>
        <ul style="margin: 4px 0; padding-left: 20px; font-size: 12px; color: #666;">
          ${c.pendingActions.slice(0, 3).map(a => `<li>${escapeHtml(a)}</li>`).join('')}
        </ul>
      </td>
    </tr>
    ` : ''}
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Daily Case Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
  <div style="background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1a365d 0%, #2d4a6f 100%); color: white; padding: 24px;">
      <h1 style="margin: 0; font-size: 24px;">Delhi Courts Daily Digest</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">${date} | ${cases.length} Active Cases</p>
    </div>
    
    <div style="padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666;">CNR</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666;">Parties</th>
            <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #666;">Next Date</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666;">Stage</th>
          </tr>
        </thead>
        <tbody>
          ${caseRows}
        </tbody>
      </table>
    </div>

    <div style="background: #f8f9fa; padding: 16px 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
      <p style="margin: 0;">
        This is an automated digest from Delhi Court Case Extractor. 
        <br>Generated at ${new Date().toISOString()}
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

// Check if it's time to send digest (7 AM IST)
export function shouldSendDigest(): boolean {
  const istNow = getISTDate();
  const hour = istNow.getHours();
  const minute = istNow.getMinutes();
  
  // Send between 7:00 and 7:10 AM IST
  return hour === 7 && minute < 10;
}

// Scheduler check - call this from main monitoring scheduler
export async function checkAndSendDailyDigest(): Promise<void> {
  if (shouldSendDigest()) {
    console.log('[DailyDigest] 7 AM IST - sending daily digest');
    await generateDailyDigest();
  }
}
