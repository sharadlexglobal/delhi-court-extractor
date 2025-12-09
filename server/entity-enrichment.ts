import { storage } from "./storage";
import type { BusinessEntity, InsertEntityContact } from "@shared/schema";

interface EnrichmentResult {
  cin?: string;
  llpin?: string;
  gstin?: string;
  pan?: string;
  registeredAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  phone?: string;
  website?: string;
  companyStatus?: string;
  dataSource?: string;
  directors?: Array<{
    name: string;
    designation: string;
    din?: string;
  }>;
}

function extractCompanyIdentifiers(name: string): { possibleCIN: string | null; possibleLLPIN: string | null } {
  const cinPattern = /[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/;
  const llpinPattern = /AAA-\d{4}/;
  
  const cinMatch = name.match(cinPattern);
  const llpinMatch = name.match(llpinPattern);
  
  return {
    possibleCIN: cinMatch ? cinMatch[0] : null,
    possibleLLPIN: llpinMatch ? llpinMatch[0] : null,
  };
}

function inferEntityDetails(entity: BusinessEntity): Partial<EnrichmentResult> {
  const name = entity.name.toLowerCase();
  const result: Partial<EnrichmentResult> = {};
  
  if (name.includes("delhi") || name.includes("new delhi")) {
    result.city = "New Delhi";
    result.state = "Delhi";
  } else if (name.includes("mumbai") || name.includes("bombay")) {
    result.city = "Mumbai";
    result.state = "Maharashtra";
  } else if (name.includes("bangalore") || name.includes("bengaluru")) {
    result.city = "Bengaluru";
    result.state = "Karnataka";
  } else if (name.includes("chennai") || name.includes("madras")) {
    result.city = "Chennai";
    result.state = "Tamil Nadu";
  } else if (name.includes("kolkata") || name.includes("calcutta")) {
    result.city = "Kolkata";
    result.state = "West Bengal";
  }
  
  if (entity.entityType === "Pvt Ltd" || entity.entityType === "Private Limited") {
    result.companyStatus = "Active";
  } else if (entity.entityType === "LLP") {
    result.companyStatus = "Active";
  }
  
  return result;
}

async function enrichFromMCA(entity: BusinessEntity): Promise<EnrichmentResult | null> {
  const identifiers = extractCompanyIdentifiers(entity.name);
  const inferred = inferEntityDetails(entity);
  
  return {
    cin: identifiers.possibleCIN || undefined,
    llpin: identifiers.possibleLLPIN || undefined,
    city: inferred.city,
    state: inferred.state,
    companyStatus: inferred.companyStatus,
    dataSource: "inferred",
  };
}

export async function enrichEntity(entity: BusinessEntity): Promise<boolean> {
  try {
    const enrichmentData = await enrichFromMCA(entity);
    
    if (!enrichmentData) {
      await storage.updateBusinessEntityEnrichmentStatus(entity.id, "failed");
      return false;
    }
    
    await storage.updateBusinessEntityWithEnrichment(entity.id, {
      cin: enrichmentData.cin,
      llpin: enrichmentData.llpin,
      gstin: enrichmentData.gstin,
      pan: enrichmentData.pan,
      registeredAddress: enrichmentData.registeredAddress,
      city: enrichmentData.city,
      state: enrichmentData.state,
      pincode: enrichmentData.pincode,
      email: enrichmentData.email,
      phone: enrichmentData.phone,
      website: enrichmentData.website,
      companyStatus: enrichmentData.companyStatus,
      dataSource: enrichmentData.dataSource || "mca",
      enrichmentStatus: "completed",
    });
    
    if (enrichmentData.directors && enrichmentData.directors.length > 0) {
      for (let i = 0; i < enrichmentData.directors.length; i++) {
        const director = enrichmentData.directors[i];
        await storage.createEntityContact({
          entityId: entity.id,
          contactType: "director",
          name: director.name,
          designation: director.designation,
          din: director.din,
          isPrimary: i === 0,
        });
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error enriching entity ${entity.id}:`, error);
    await storage.updateBusinessEntityEnrichmentStatus(entity.id, "failed");
    return false;
  }
}

export async function enrichEntitiesForJob(
  jobId: number,
  entities: BusinessEntity[]
): Promise<void> {
  await storage.updateProcessingJobStarted(jobId);

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const entity of entities) {
    try {
      const success = await enrichEntity(entity);
      
      if (success) {
        successful++;
      } else {
        failed++;
      }
      processed++;
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);

    } catch (error) {
      console.error(`Error processing entity ${entity.id}:`, error);
      failed++;
      processed++;
      await storage.updateProcessingJobProgress(jobId, processed, successful, failed);
    }
  }

  const finalStatus = failed === entities.length ? "failed" : "completed";
  await storage.updateProcessingJobStatus(jobId, finalStatus);
}
