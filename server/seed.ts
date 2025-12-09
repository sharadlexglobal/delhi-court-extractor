import { db } from "./db";
import { districts } from "@shared/schema";

const delhiDistricts = [
  { name: "Central Delhi", codePrefix: "CT", establishmentCode: "01", baseUrl: "https://central.dcourts.gov.in" },
  { name: "East Delhi", codePrefix: "ET", establishmentCode: "01", baseUrl: "https://east.dcourts.gov.in" },
  { name: "New Delhi", codePrefix: "ND", establishmentCode: "01", baseUrl: "https://newdelhi.dcourts.gov.in" },
  { name: "North Delhi", codePrefix: "NT", establishmentCode: "01", baseUrl: "https://north.dcourts.gov.in" },
  { name: "North East Delhi", codePrefix: "NE", establishmentCode: "01", baseUrl: "https://northeast.dcourts.gov.in" },
  { name: "North West Delhi", codePrefix: "NW", establishmentCode: "01", baseUrl: "https://northwest.dcourts.gov.in" },
  { name: "Shahdara Delhi", codePrefix: "SH", establishmentCode: "01", baseUrl: "https://shahdara.dcourts.gov.in" },
  { name: "South Delhi", codePrefix: "ST", establishmentCode: "01", baseUrl: "https://south.dcourts.gov.in" },
  { name: "South East Delhi", codePrefix: "SE", establishmentCode: "01", baseUrl: "https://southeast.dcourts.gov.in" },
  { name: "South West Delhi", codePrefix: "SW", establishmentCode: "01", baseUrl: "https://southwest.dcourts.gov.in" },
  { name: "West Delhi", codePrefix: "WT", establishmentCode: "01", baseUrl: "https://west.dcourts.gov.in" },
];

async function seed() {
  console.log("Seeding districts...");
  
  for (const district of delhiDistricts) {
    try {
      await db.insert(districts).values({
        name: district.name,
        codePrefix: district.codePrefix,
        establishmentCode: district.establishmentCode,
        baseUrl: district.baseUrl,
        serialWidth: 7,
        yearFormat: "3-digit",
        isActive: true,
      }).onConflictDoNothing();
      console.log(`  Added: ${district.name}`);
    } catch (error) {
      console.log(`  Skipped: ${district.name} (already exists)`);
    }
  }
  
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
