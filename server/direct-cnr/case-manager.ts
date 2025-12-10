import { db } from '../db';
import { directCnrCases, directCnrAdvocates, directCnrOrders, directCnrMonitoring, districts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { DirectCnrCase, InsertDirectCnrCase, DirectCnrAdvocate, InsertDirectCnrAdvocate } from '@shared/schema';

export interface ParsedCNR {
  cnr: string;
  districtCode: string;
  establishmentCode: string;
  serialNumber: number;
  year: number;
  baseUrl: string;
}

const DISTRICT_MAPPING: Record<string, string> = {
  'CT': 'https://centraldelhi.dcourts.gov.in',
  'ET': 'https://eastdelhi.dcourts.gov.in',
  'ND': 'https://newdelhidc.dcourts.gov.in',
  'NT': 'https://northdelhi.dcourts.gov.in',
  'NE': 'https://northeastdelhi.dcourts.gov.in',
  'NW': 'https://rohini.dcourts.gov.in',
  'SH': 'https://shahdara.dcourts.gov.in',
  'ST': 'https://southdelhi.dcourts.gov.in',
  'SE': 'https://southeastdelhi.dcourts.gov.in',
  'SW': 'https://southwestdelhi.dcourts.gov.in',
  'WT': 'https://westdelhi.dcourts.gov.in'
};

export function parseCNR(cnr: string): ParsedCNR | null {
  const normalizedCnr = cnr.toUpperCase().replace(/\s/g, '');
  
  // Allow any 2-digit establishment code (01, 02, 03, etc.) and years from 2010-2099
  if (!/^DL[A-Z]{2}\d{2}\d{6}\d{4}$/.test(normalizedCnr)) {
    return null;
  }

  const districtCode = normalizedCnr.substring(2, 4);
  const establishmentCode = normalizedCnr.substring(4, 6);
  const serialNumber = parseInt(normalizedCnr.substring(6, 12));
  const year = parseInt(normalizedCnr.substring(12, 16));

  // Accept years from 2010 to current year + 1
  const currentYear = new Date().getFullYear();
  if (year < 2010 || year > currentYear + 1) {
    return null;
  }

  const baseUrl = DISTRICT_MAPPING[districtCode];
  if (!baseUrl) return null;

  return {
    cnr: normalizedCnr,
    districtCode,
    establishmentCode,
    serialNumber,
    year,
    baseUrl
  };
}

export async function getDistrictByCode(codePrefix: string): Promise<{ id: number; baseUrl: string } | null> {
  const [district] = await db.select()
    .from(districts)
    .where(eq(districts.codePrefix, codePrefix))
    .limit(1);
  
  if (!district) return null;
  return { id: district.id, baseUrl: district.baseUrl };
}

export async function createAdvocate(data: InsertDirectCnrAdvocate): Promise<DirectCnrAdvocate> {
  const [advocate] = await db.insert(directCnrAdvocates)
    .values(data)
    .returning();
  return advocate;
}

export async function getAdvocateById(id: number): Promise<DirectCnrAdvocate | null> {
  const [advocate] = await db.select()
    .from(directCnrAdvocates)
    .where(eq(directCnrAdvocates.id, id))
    .limit(1);
  return advocate || null;
}

export async function getAllAdvocates(): Promise<DirectCnrAdvocate[]> {
  return db.select().from(directCnrAdvocates).where(eq(directCnrAdvocates.isActive, true));
}

export async function createCase(data: InsertDirectCnrCase): Promise<DirectCnrCase> {
  const [newCase] = await db.insert(directCnrCases)
    .values(data)
    .returning();
  return newCase;
}

export async function getCaseById(id: number): Promise<DirectCnrCase | null> {
  const [caseRecord] = await db.select()
    .from(directCnrCases)
    .where(eq(directCnrCases.id, id))
    .limit(1);
  return caseRecord || null;
}

export async function getCaseByCnr(cnr: string): Promise<DirectCnrCase | null> {
  const [caseRecord] = await db.select()
    .from(directCnrCases)
    .where(eq(directCnrCases.cnr, cnr.toUpperCase()))
    .limit(1);
  return caseRecord || null;
}

export async function getAllCases(advocateId?: number): Promise<DirectCnrCase[]> {
  if (advocateId) {
    return db.select()
      .from(directCnrCases)
      .where(and(
        eq(directCnrCases.advocateId, advocateId),
        eq(directCnrCases.isActive, true)
      ));
  }
  return db.select().from(directCnrCases).where(eq(directCnrCases.isActive, true));
}

export async function updateCaseDetails(
  caseId: number,
  details: Partial<DirectCnrCase>
): Promise<DirectCnrCase | null> {
  const [updated] = await db.update(directCnrCases)
    .set({
      ...details,
      updatedAt: new Date()
    })
    .where(eq(directCnrCases.id, caseId))
    .returning();
  return updated || null;
}

export async function markCaseDetailsExtracted(caseId: number): Promise<void> {
  await db.update(directCnrCases)
    .set({
      caseDetailsExtracted: true,
      lastEcourtsSync: new Date(),
      updatedAt: new Date()
    })
    .where(eq(directCnrCases.id, caseId));
}

export async function markInitialOrdersDownloaded(caseId: number): Promise<void> {
  await db.update(directCnrCases)
    .set({
      initialOrdersDownloaded: true,
      updatedAt: new Date()
    })
    .where(eq(directCnrCases.id, caseId));
}

export async function deactivateCase(caseId: number): Promise<void> {
  await db.update(directCnrCases)
    .set({
      isActive: false,
      updatedAt: new Date()
    })
    .where(eq(directCnrCases.id, caseId));
}

export async function getCaseWithOrders(caseId: number): Promise<{
  case: DirectCnrCase;
  orders: any[];
} | null> {
  const caseRecord = await getCaseById(caseId);
  if (!caseRecord) return null;

  const orders = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId));

  return { case: caseRecord, orders };
}

export async function getMonitoringSchedules(caseId: number): Promise<any[]> {
  return db.select()
    .from(directCnrMonitoring)
    .where(eq(directCnrMonitoring.caseId, caseId));
}
