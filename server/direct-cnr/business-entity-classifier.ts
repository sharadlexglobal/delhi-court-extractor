import OpenAI from 'openai';
import { db } from '../db';
import { directCnrBusinessLeads, directCnrCases } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const API_TIMEOUT_MS = 30000;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: API_TIMEOUT_MS,
    });
  }
  return openaiClient;
}

const businessEntityResultSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    normalizedName: z.string(),
    isBusiness: z.boolean(),
    entityType: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    indicators: z.array(z.string()),
    reasoning: z.string(),
  })),
});

type BusinessEntityResult = z.infer<typeof businessEntityResultSchema>;

const BUSINESS_ENTITY_CLASSIFICATION_PROMPT = `You are an expert at identifying BUSINESS ENTITIES in Indian court cases. Your task is to analyze party names and determine if they are businesses or individuals.

## INDIA-SPECIFIC BUSINESS PATTERNS

### 1. EXPLICIT LEGAL SUFFIXES (100% business):
- Pvt Ltd, Private Limited, Ltd, Limited
- LLP, Limited Liability Partnership
- OPC (One Person Company)
- Inc, Incorporated, Corporation, Corp
- Co., Company

### 2. EXPLICIT BUSINESS WORDS (95%+ business):
**Trade/Commerce:**
- Enterprises, Industries, Traders, Trading, Trading Co
- Exports, Imports, Exim, Exporters, Importers
- Merchants, Suppliers, Distributors, Dealers

**Services:**
- Solutions, Services, Consultants, Consulting, Consultancy
- Associates, Agencies, Agency
- Advisors, Advisory

**Manufacturing/Production:**
- Manufacturing, Manufacturers, Fabricators
- Works, Foundry, Mills, Factory
- Pharma, Pharmaceuticals, Chemicals

**Construction/Real Estate:**
- Construction, Constructions, Builders, Developers
- Properties, Realty, Infra, Infrastructure
- Estate, Estates

**Retail/Hospitality:**
- Store, Stores, Mart, Emporium, Bazaar
- Hotels, Hospitality, Resorts, Restaurant
- Caterers, Catering

**Creative/Tech:**
- Creations, Creatives, Studios, Productions
- Tech, Technologies, Infotech, Softech, IT
- Systems, Automation, Digital

**Finance:**
- Financiers, Finance, Credits, Investments
- Securities, Capital

**Specific Industries:**
- Jewellers, Jewellery, Textiles, Fabrics, Garments
- Motors, Automobiles, Auto, Tyres
- Foods, Beverages, Dairy
- Agro, Agricultural, Farms
- Logistics, Transport, Carriers, Movers, Packers

### 3. RELATIONSHIP PATTERNS (90%+ business):
- "& Sons" (e.g., Gupta & Sons)
- "& Brothers" / "Bros" (e.g., Sharma Bros)
- "& Co" / "& Company"
- "& Associates"
- "& Partners"

### 4. ORGANIZATIONAL TYPES (business/institution):
- Trust, Society, Foundation, NGO
- Club, Association, Federation
- Hospital, Clinic, Medical Centre
- School, College, Institute, Academy
- Bank, Cooperative, Credit Society

### 5. REGIONAL NAMING PATTERNS:

**North India:**
- [Family Name] + Business Word: "Agarwal Traders", "Gupta Enterprises"
- [First Name] + Business Word: "Rajan Motors", "Suresh Textiles"

**South India:**
- Sri/Shri prefix: "Sri Lakshmi Industries", "Shri Balaji Enterprises"
- [Name] + Business Word: "Murugan Enterprises", "Venkatesh Traders"

**Gujarat/Rajasthan:**
- "Patel Industries", "Shah & Co", "Jain Traders"
- Often uses "Seth" or traditional prefixes

**Punjab/Haryana:**
- "Singh Motors", "Dhillon Farms", "Gill Transport"

**Bengal/East:**
- "Bose Brothers", "Ghosh Enterprises", "Das Trading"

### 6. REVERSE ENGINEERING LOGIC:

A name is likely a BUSINESS if:
1. It contains ANY business suffix/word from above lists
2. It has unusual structure for a personal name (e.g., numbers, special characters)
3. It's in ALL CAPS with 3+ words
4. It combines a name with a non-name word
5. It doesn't follow typical Indian personal name pattern (First + Middle/Last)

A name is likely an INDIVIDUAL if:
1. It follows pattern: [Title] + [First Name] + [Middle Name/Initial] + [Last Name]
2. Common titles: Shri, Smt, Mr, Mrs, Ms, Dr, Adv
3. It's a simple 2-3 word name without business indicators
4. It contains "S/o", "D/o", "W/o" (Son of, Daughter of, Wife of)

## OUTPUT FORMAT

For each party name provided, return:
{
  "entities": [
    {
      "name": "Original name as provided",
      "normalizedName": "Cleaned, standardized name",
      "isBusiness": true/false,
      "entityType": "pvt_ltd|llp|partnership|proprietorship|trust|society|huf|individual|unknown",
      "confidence": 0.0 to 1.0,
      "indicators": ["List of business indicators found"],
      "reasoning": "Brief explanation of classification"
    }
  ]
}

## ENTITY TYPES:
- pvt_ltd: Private Limited Company
- ltd: Public Limited Company  
- llp: Limited Liability Partnership
- partnership: Partnership Firm (& Sons, & Bros, & Co without Ltd)
- proprietorship: Sole Proprietorship (single name + business word)
- trust: Trust/Foundation
- society: Society/Association/Club
- huf: Hindu Undivided Family
- government: Government body/department
- individual: Natural person
- unknown: Cannot determine

## EXAMPLES:

Input: "Ram Enterprises"
Output: { "isBusiness": true, "entityType": "proprietorship", "confidence": 0.95, "indicators": ["Enterprises suffix"], "reasoning": "Contains explicit business word 'Enterprises'" }

Input: "Gupta & Sons"
Output: { "isBusiness": true, "entityType": "partnership", "confidence": 0.92, "indicators": ["& Sons pattern"], "reasoning": "Traditional Indian partnership naming pattern" }

Input: "Shri Ramesh Kumar S/o Shri Suresh Kumar"
Output: { "isBusiness": false, "entityType": "individual", "confidence": 0.98, "indicators": [], "reasoning": "Contains S/o indicating individual, follows personal name pattern" }

Input: "XYZ Creations"
Output: { "isBusiness": true, "entityType": "proprietorship", "confidence": 0.90, "indicators": ["Creations suffix"], "reasoning": "Contains business word 'Creations', XYZ is not a typical personal name" }

Input: "Sri Lakshmi Industries Pvt Ltd"
Output: { "isBusiness": true, "entityType": "pvt_ltd", "confidence": 1.0, "indicators": ["Pvt Ltd", "Industries", "Sri prefix"], "reasoning": "Contains explicit 'Pvt Ltd' suffix - definitely a company" }

Now analyze the following party names:`;

export interface PartyInfo {
  name: string;
  role: 'petitioner' | 'respondent';
}

export async function classifyBusinessEntities(
  caseId: number,
  parties: PartyInfo[]
): Promise<{ success: boolean; leads: number; error?: string }> {
  if (!parties.length) {
    return { success: true, leads: 0 };
  }

  try {
    const openai = getOpenAI();

    const partyList = parties.map((p, i) => `${i + 1}. ${p.name} (${p.role})`).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: BUSINESS_ENTITY_CLASSIFICATION_PROMPT,
        },
        {
          role: 'user',
          content: partyList,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const result = businessEntityResultSchema.parse(parsed);

    let leadsCreated = 0;

    for (let i = 0; i < result.entities.length; i++) {
      const entity = result.entities[i];
      const party = parties[i];

      if (entity.isBusiness && entity.confidence >= 0.7) {
        await db.insert(directCnrBusinessLeads).values({
          caseId,
          rawName: party.name,
          normalizedName: entity.normalizedName,
          entityType: entity.entityType,
          partyRole: party.role,
          businessIndicators: JSON.stringify(entity.indicators),
          classificationConfidence: entity.confidence,
          isConfirmedBusiness: entity.confidence >= 0.9,
          indiamartSearchQuery: `indiamart ${entity.normalizedName}`,
          enrichmentStatus: 'pending',
        }).onConflictDoNothing();
        
        leadsCreated++;
      }
    }

    console.log(`[BusinessClassifier] Case ${caseId}: Found ${leadsCreated} business leads out of ${parties.length} parties`);

    return { success: true, leads: leadsCreated };
  } catch (error) {
    console.error('[BusinessClassifier] Error:', error);
    return { 
      success: false, 
      leads: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function classifyBusinessEntitiesForCase(caseId: number): Promise<{ success: boolean; leads: number; error?: string }> {
  const caseData = await db.select().from(directCnrCases).where(eq(directCnrCases.id, caseId)).limit(1);
  
  if (!caseData.length) {
    return { success: false, leads: 0, error: 'Case not found' };
  }

  const parties: PartyInfo[] = [];

  if (caseData[0].petitionerName) {
    const petitionerNames = caseData[0].petitionerName.split(/[,\n]+/).map(n => n.trim()).filter(n => n);
    for (const name of petitionerNames) {
      parties.push({ name, role: 'petitioner' });
    }
  }

  if (caseData[0].respondentName) {
    const respondentNames = caseData[0].respondentName.split(/[,\n]+/).map(n => n.trim()).filter(n => n);
    for (const name of respondentNames) {
      parties.push({ name, role: 'respondent' });
    }
  }

  return classifyBusinessEntities(caseId, parties);
}
