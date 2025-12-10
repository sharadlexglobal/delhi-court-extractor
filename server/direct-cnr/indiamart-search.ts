import { GoogleGenAI } from "@google/genai";
import { db } from '../db';
import { directCnrBusinessLeads } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

let geminiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    throw new Error("Gemini AI Integrations not configured");
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }
  return geminiClient;
}

const indiamartSearchResultSchema = z.object({
  found: z.boolean(),
  profileUrl: z.string().nullable(),
  companyName: z.string().nullable(),
  products: z.array(z.string()).default([]),
  location: z.string().nullable(),
  phone: z.string().nullable(),
  gstNumber: z.string().nullable(),
  yearEstablished: z.string().nullable(),
  employeeCount: z.string().nullable(),
  turnover: z.string().nullable(),
  searchConfidence: z.number().min(0).max(1),
  searchSummary: z.string(),
  alternativeResults: z.array(z.object({
    name: z.string(),
    url: z.string().nullable(),
    location: z.string().nullable(),
  })).default([]),
});

type IndiamartSearchResult = z.infer<typeof indiamartSearchResultSchema>;

const INDIAMART_SEARCH_PROMPT = `You are a business intelligence assistant helping to find Indian businesses on IndiaMART.

IndiaMART (indiamart.com) is India's largest B2B marketplace where businesses list their products and services.

## YOUR TASK

Search for the given business name on IndiaMART using Google Search. The search query should be:
site:indiamart.com "{business_name}"

## WHAT TO LOOK FOR

1. **Company Profile Page**: URLs like indiamart.com/company-name/
2. **Seller Profile**: Look for profile details including:
   - Company name (verify it matches or is similar)
   - Products/services listed
   - Location (city, state)
   - Contact information
   - GST number
   - Year established
   - Employee count
   - Annual turnover

## MATCHING RULES

1. **Exact Match**: Company name matches exactly - high confidence (0.9-1.0)
2. **Close Match**: Company name is very similar (minor spelling variations) - medium-high confidence (0.7-0.9)
3. **Partial Match**: Part of the name matches - medium confidence (0.5-0.7)
4. **Multiple Results**: If multiple similar businesses found, return the best match and list alternatives
5. **No Match**: If no relevant IndiaMART profile found, return found=false

## OUTPUT FORMAT

Return a JSON object:
{
  "found": true/false,
  "profileUrl": "https://www.indiamart.com/company-name/" or null,
  "companyName": "Name as shown on IndiaMART",
  "products": ["Product 1", "Product 2"],
  "location": "City, State",
  "phone": "Contact number if visible",
  "gstNumber": "GST number if shown",
  "yearEstablished": "Year if shown",
  "employeeCount": "Employee count range",
  "turnover": "Annual turnover range",
  "searchConfidence": 0.0 to 1.0,
  "searchSummary": "Brief summary of what was found",
  "alternativeResults": [
    { "name": "Similar Business 1", "url": "...", "location": "..." }
  ]
}

## IMPORTANT NOTES

- Only return IndiaMART profile URLs (indiamart.com domain)
- Verify the business name matches before returning high confidence
- If the search returns no IndiaMART results, honestly report found=false
- Include alternative businesses if the exact match is uncertain

Now search for:`;

export async function searchIndiamartProfile(
  leadId: number,
  businessName: string
): Promise<{ success: boolean; result?: IndiamartSearchResult; error?: string }> {
  try {
    const ai = getGemini();

    const searchQuery = `site:indiamart.com "${businessName}"`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${INDIAMART_SEARCH_PROMPT}

Business Name: ${businessName}
Search Query: ${searchQuery}

Use your knowledge from Google Search to find this business on IndiaMART. Return JSON response.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    // Handle both direct text property and candidates array structure
    let content = response.text;
    if (!content && response.candidates?.[0]?.content?.parts?.[0]) {
      const part = response.candidates[0].content.parts[0];
      content = (part as any).text || '';
    }
    
    console.log(`[IndiamartSearch] Raw response for "${businessName}":`, JSON.stringify(response).substring(0, 500));
    
    if (!content) {
      throw new Error('Empty response from Gemini - no text content found');
    }

    // Clean potential markdown code blocks from response
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.slice(7);
    }
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.slice(3);
    }
    if (cleanedContent.endsWith('```')) {
      cleanedContent = cleanedContent.slice(0, -3);
    }
    cleanedContent = cleanedContent.trim();

    const parsed = JSON.parse(cleanedContent);
    const result = indiamartSearchResultSchema.parse(parsed);

    await db.update(directCnrBusinessLeads)
      .set({
        indiamartSearchQuery: searchQuery,
        indiamartProfileUrl: result.profileUrl,
        indiamartSearchResults: JSON.stringify(result),
        enrichmentStatus: result.found ? 'enriched' : 'not_found',
        enrichedAt: new Date(),
        updatedAt: new Date(),
        ...(result.phone && { phone: result.phone }),
        ...(result.gstNumber && { gstin: result.gstNumber }),
        ...(result.location && { 
          city: result.location.split(',')[0]?.trim(),
          state: result.location.split(',')[1]?.trim()
        }),
      })
      .where(eq(directCnrBusinessLeads.id, leadId));

    console.log(`[IndiamartSearch] Lead ${leadId}: ${result.found ? 'Found' : 'Not found'} - ${result.searchSummary}`);

    return { success: true, result };
  } catch (error) {
    console.error('[IndiamartSearch] Error:', error);
    
    await db.update(directCnrBusinessLeads)
      .set({
        enrichmentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(directCnrBusinessLeads.id, leadId));

    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function enrichPendingLeads(limit: number = 5): Promise<{ processed: number; found: number; errors: number }> {
  const pendingLeads = await db.select()
    .from(directCnrBusinessLeads)
    .where(eq(directCnrBusinessLeads.enrichmentStatus, 'pending'))
    .limit(limit);

  let processed = 0;
  let found = 0;
  let errors = 0;

  for (const lead of pendingLeads) {
    await db.update(directCnrBusinessLeads)
      .set({ enrichmentStatus: 'searching', updatedAt: new Date() })
      .where(eq(directCnrBusinessLeads.id, lead.id));

    const searchName = lead.normalizedName || lead.rawName;
    const result = await searchIndiamartProfile(lead.id, searchName);

    processed++;
    if (result.success && result.result?.found) {
      found++;
    } else if (!result.success) {
      errors++;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`[IndiamartSearch] Batch complete: ${processed} processed, ${found} found, ${errors} errors`);

  return { processed, found, errors };
}
