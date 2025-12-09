import { db } from "./db";
import { districts } from "@shared/schema";

const delhiDistricts = [
  { name: "Central Delhi", codePrefix: "CE", establishmentCode: "01", baseUrl: "https://centraldelhi.dcourts.gov.in" },
  { name: "East Delhi", codePrefix: "EA", establishmentCode: "01", baseUrl: "https://eastdelhi.dcourts.gov.in" },
  { name: "New Delhi", codePrefix: "ND", establishmentCode: "01", baseUrl: "https://newdelhi.dcourts.gov.in" },
  { name: "North Delhi", codePrefix: "NO", establishmentCode: "01", baseUrl: "https://northdelhi.dcourts.gov.in" },
  { name: "North East Delhi", codePrefix: "NE", establishmentCode: "01", baseUrl: "https://northeastdelhi.dcourts.gov.in" },
  { name: "North West Delhi", codePrefix: "NW", establishmentCode: "01", baseUrl: "https://northwestdelhi.dcourts.gov.in" },
  { name: "Shahdara Delhi", codePrefix: "SH", establishmentCode: "01", baseUrl: "https://shahdara.dcourts.gov.in" },
  { name: "South Delhi", codePrefix: "SO", establishmentCode: "01", baseUrl: "https://southdelhi.dcourts.gov.in" },
  { name: "South East Delhi", codePrefix: "SE", establishmentCode: "01", baseUrl: "https://southeastdelhi.dcourts.gov.in" },
  { name: "South West Delhi", codePrefix: "SW", establishmentCode: "01", baseUrl: "https://southwestdelhi.dcourts.gov.in" },
  { name: "West Delhi", codePrefix: "WE", establishmentCode: "01", baseUrl: "https://westdelhi.dcourts.gov.in" },
];

export async function seedDistricts(): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  
  for (const district of delhiDistricts) {
    try {
      const result = await db.insert(districts).values({
        name: district.name,
        codePrefix: district.codePrefix,
        establishmentCode: district.establishmentCode,
        baseUrl: district.baseUrl,
        serialWidth: 7,
        yearFormat: "3-digit",
        isActive: true,
      }).onConflictDoNothing();
      
      if (result.rowCount && result.rowCount > 0) {
        added++;
        console.log(`  Added: ${district.name}`);
      } else {
        skipped++;
        console.log(`  Skipped: ${district.name} (already exists)`);
      }
    } catch (error) {
      skipped++;
      console.log(`  Skipped: ${district.name} (error)`);
    }
  }
  
  return { added, skipped };
}

async function seed() {
  console.log("Seeding districts...");
  const result = await seedDistricts();
  console.log(`Seeding complete! Added: ${result.added}, Skipped: ${result.skipped}`);
  process.exit(0);
}

import { fileURLToPath } from 'url';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  seed().catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
}
