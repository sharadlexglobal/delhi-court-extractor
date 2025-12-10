import { chromium, Page } from 'playwright';
import OpenAI from 'openai';

const ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
const CNR_INPUT_FIELD_ID = "#cino";
const CAPTCHA_INPUT_FIELD_ID = "#fcaptcha_code";
const SEARCH_BUTTON_ID = "#searchbtn";
const CAPTCHA_IMAGE_PATTERN = 'img[src*="securimage"]';
const MAX_RETRIES = 5;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
    });
  }
  return openaiClient;
}

export interface CaseDetails {
  status: 'success' | 'error';
  cnr: string;
  extractionDate: string;
  error?: string;
  caseDetails: {
    court: string | null;
    caseType: string | null;
    filingNumber: string | null;
    filingDate: string | null;
    registrationNumber: string | null;
    registrationDate: string | null;
  };
  caseStatus: {
    firstHearingDate: string | null;
    nextHearingDate: string | null;
    caseStage: string | null;
    courtNumberAndJudge: string | null;
  };
  parties: {
    petitioner: { name: string | null; advocate: string | null };
    respondent: { name: string | null; advocate: string | null };
  };
  caseHistory: Array<{
    judge: string;
    businessOnDate: string;
    hearingDate: string;
    purposeOfHearing: string;
  }>;
  interimOrders: Array<{
    orderNumber: number;
    orderDate: string;
    orderDetails: string | null;
  }>;
}

async function solveCaptcha(captchaImageBytes: Buffer): Promise<string> {
  const openai = getOpenAI();
  const base64Image = captchaImageBytes.toString('base64');

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: "Read this CAPTCHA image and return ONLY the 6 characters exactly as shown. No explanation, no spaces, just the 6 characters. Preserve the exact case (uppercase/lowercase). Be very careful with similar looking characters like 0/O, 1/l/I, 5/S, 8/B."
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${base64Image}`
          }
        }
      ]
    }],
    max_tokens: 20
  });

  const solution = response.choices[0].message.content?.trim() || '';

  if (!/^[a-zA-Z0-9]{6}$/.test(solution)) {
    throw new Error(`Invalid CAPTCHA solution format: ${solution}`);
  }

  return solution;
}

async function parseECourtsPage(page: Page, cnr: string): Promise<CaseDetails> {
  const caseData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0]?.textContent?.trim().replace(/[:\s]+$/, '') || '';
          const value = cells[1]?.textContent?.trim() || '';
          if (label && value && !label.includes('{') && !label.includes('"')) {
            data[label] = value;
          }
        }
      }
    }
    return data;
  });
  
  const extractField = (fieldNames: string[]): string | null => {
    for (const name of fieldNames) {
      for (const [key, value] of Object.entries(caseData)) {
        if (key.toLowerCase().includes(name.toLowerCase()) && value) {
          return value;
        }
      }
    }
    return null;
  };

  const caseHistory = await page.evaluate(() => {
    const rows: Array<{judge: string; businessOnDate: string; hearingDate: string; purposeOfHearing: string}> = [];
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('th'));
      let isHistoryTable = false;
      headers.forEach((h: HTMLTableCellElement) => {
        if (h.textContent?.includes('Business on Date') || h.textContent?.includes('Hearing Date')) {
          isHistoryTable = true;
        }
      });
      if (isHistoryTable) {
        const trs = Array.from(table.querySelectorAll('tbody tr'));
        trs.forEach((tr: Element) => {
          const tds = tr.querySelectorAll('td');
          if (tds.length >= 4) {
            rows.push({
              judge: tds[0]?.textContent?.trim() || '',
              businessOnDate: tds[1]?.textContent?.trim() || '',
              hearingDate: tds[2]?.textContent?.trim() || '',
              purposeOfHearing: tds[3]?.textContent?.trim() || ''
            });
          }
        });
        break;
      }
    }
    return rows;
  });

  const interimOrders = await page.evaluate(() => {
    const orders: Array<{orderNumber: number; orderDate: string; orderDetails: string | null}> = [];
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('th'));
      let isOrderTable = false;
      headers.forEach((h: HTMLTableCellElement) => {
        if (h.textContent?.includes('Order Number') || h.textContent?.includes('Order Date')) {
          isOrderTable = true;
        }
      });
      if (isOrderTable) {
        const trs = Array.from(table.querySelectorAll('tbody tr'));
        trs.forEach((tr: Element, index: number) => {
          const tds = tr.querySelectorAll('td');
          if (tds.length >= 2) {
            const orderNoText = tds[0]?.textContent?.trim() || '';
            const orderNo = parseInt(orderNoText) || (index + 1);
            const orderDate = tds[1]?.textContent?.trim() || '';
            const orderDetails = tds.length >= 3 ? tds[2]?.textContent?.trim() || null : null;
            if (orderDate) {
              orders.push({
                orderNumber: orderNo,
                orderDate,
                orderDetails
              });
            }
          }
        });
        break;
      }
    }
    return orders;
  });

  const parties = await page.evaluate(() => {
    let petitionerName: string | null = null;
    let petitionerAdvocate: string | null = null;
    let respondentName: string | null = null;
    let respondentAdvocate: string | null = null;
    const debugInfo: string[] = [];

    const tables = Array.from(document.querySelectorAll('table'));
    debugInfo.push(`Total tables on page: ${tables.length}`);
    
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const text = (table.textContent || '').substring(0, 200);
      debugInfo.push(`Table ${i}: "${text.replace(/\s+/g, ' ').substring(0, 80)}..."`);
    }
    
    const bodyText = document.body?.textContent || '';
    const hasPetitioner = bodyText.includes('Petitioner');
    const hasRespondent = bodyText.includes('Respondent');
    debugInfo.push(`Body has Petitioner: ${hasPetitioner}, Respondent: ${hasRespondent}`);
    
    for (const table of tables) {
      const text = table.textContent || '';
      if (text.includes('Petitioner') || text.includes('Respondent')) {
        debugInfo.push(`Found party table with ${table.querySelectorAll('tr').length} rows`);
        const rows = Array.from(table.querySelectorAll('tr'));
        rows.forEach((row: HTMLTableRowElement, rowIndex: number) => {
          const cells = row.querySelectorAll('td');
          const ths = row.querySelectorAll('th');
          if (cells.length >= 2) {
            const label = cells[0]?.textContent?.trim().toLowerCase() || '';
            const value = cells[1]?.textContent?.trim() || '';
            debugInfo.push(`Row ${rowIndex}: label="${label.substring(0, 50)}", value="${value.substring(0, 50)}"`);
            if (label.includes('petitioner') && !label.includes('advocate')) {
              petitionerName = value;
            } else if (label.includes('petitioner') && label.includes('advocate')) {
              petitionerAdvocate = value;
            } else if (label.includes('respondent') && !label.includes('advocate')) {
              respondentName = value;
            } else if (label.includes('respondent') && label.includes('advocate')) {
              respondentAdvocate = value;
            }
          } else if (ths.length >= 1) {
            const thText = ths[0]?.textContent?.trim() || '';
            const tdText = cells[0]?.textContent?.trim() || '';
            debugInfo.push(`Row ${rowIndex} (th/td): th="${thText.substring(0, 30)}", td="${tdText.substring(0, 50)}"`);
            if (thText.toLowerCase().includes('petitioner') && !thText.toLowerCase().includes('advocate')) {
              petitionerName = tdText;
            } else if (thText.toLowerCase().includes('petitioner') && thText.toLowerCase().includes('advocate')) {
              petitionerAdvocate = tdText;
            } else if (thText.toLowerCase().includes('respondent') && !thText.toLowerCase().includes('advocate')) {
              respondentName = tdText;
            } else if (thText.toLowerCase().includes('respondent') && thText.toLowerCase().includes('advocate')) {
              respondentAdvocate = tdText;
            }
          }
        });
      }
    }
    return {
      petitioner: { name: petitionerName, advocate: petitionerAdvocate },
      respondent: { name: respondentName, advocate: respondentAdvocate },
      debug: debugInfo
    };
  });
  
  console.log(`[eCourts-Party] Debug: ${(parties as any).debug?.join(' | ') || 'No debug info'}`);

  console.log(`[eCourts] Extracted case data keys: ${Object.keys(caseData).slice(0, 10).join(', ')}`);
  
  return {
    status: 'success',
    cnr,
    extractionDate: new Date().toISOString(),
    caseDetails: {
      court: extractField(['Court']),
      caseType: extractField(['Case Type']),
      filingNumber: extractField(['Filing Number']),
      filingDate: extractField(['Filing Date']),
      registrationNumber: extractField(['Registration Number', 'Reg. Number']),
      registrationDate: extractField(['Registration Date', 'Reg. Date']),
    },
    caseStatus: {
      firstHearingDate: extractField(['First Hearing Date']),
      nextHearingDate: extractField(['Next Hearing Date']),
      caseStage: extractField(['Case Stage', 'Stage']),
      courtNumberAndJudge: extractField(['Court Number and Judge']),
    },
    parties,
    caseHistory,
    interimOrders
  };
}

export async function extractCaseDetails(cnr: string): Promise<CaseDetails> {
  console.log(`[eCourts] Starting extraction for CNR: ${cnr}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[eCourts] Attempt ${attempt + 1}/${MAX_RETRIES}`);
        
        await page.goto(ECOURTS_URL, { timeout: 30000, waitUntil: 'networkidle' });
        await page.waitForSelector(CNR_INPUT_FIELD_ID, { timeout: 10000 });

        await page.fill(CNR_INPUT_FIELD_ID, cnr);

        const captchaImage = page.locator(CAPTCHA_IMAGE_PATTERN).first();
        await captchaImage.waitFor({ state: 'visible', timeout: 10000 });
        const captchaBytes = await captchaImage.screenshot();
        
        console.log(`[eCourts] Solving CAPTCHA...`);
        const captchaSolution = await solveCaptcha(captchaBytes);
        console.log(`[eCourts] CAPTCHA solution: ${captchaSolution}`);

        await page.fill(CAPTCHA_INPUT_FIELD_ID, captchaSolution);
        await page.click(SEARCH_BUTTON_ID);
        
        try {
          await page.waitForSelector('#history_cnr, .case_details_table, .alert-danger, .error', { timeout: 10000 });
        } catch {
          console.log(`[eCourts] No result selector found, checking page state...`);
        }
        
        await page.waitForTimeout(2000);
        const html = await page.content();
        
        const captchaStillVisible = await page.locator(CAPTCHA_INPUT_FIELD_ID).isVisible().catch(() => false);
        const pageTitle = await page.title();
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const hasHistoryTable = html.includes('history_cnr') || html.includes('Case History');
        const hasCaseDetails = html.includes('Case Details') || html.includes('Filing Number');
        
        console.log(`[eCourts] Page title: ${pageTitle}, CAPTCHA visible: ${captchaStillVisible}`);
        console.log(`[eCourts] Has history: ${hasHistoryTable}, Has case details: ${hasCaseDetails}`);
        console.log(`[eCourts] Body text preview: ${bodyText.substring(0, 500).replace(/\s+/g, ' ')}`);
        
        if (hasCaseDetails || hasHistoryTable) {
          console.log(`[eCourts] SUCCESS! Case details found.`);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(2000);
          
          const caseDetails = await parseECourtsPage(page, cnr);
          console.log(`[eCourts] Successfully extracted case details for CNR: ${cnr}`);
          console.log(`[eCourts] Found ${caseDetails.interimOrders.length} interim orders`);
          
          return caseDetails;
        }

        if (html.toLowerCase().includes('no record found')) {
          console.log(`[eCourts] No record found for CNR: ${cnr}`);
          return {
            status: 'error',
            cnr,
            extractionDate: new Date().toISOString(),
            error: 'No record found for this CNR',
            caseDetails: { court: null, caseType: null, filingNumber: null, filingDate: null, registrationNumber: null, registrationDate: null },
            caseStatus: { firstHearingDate: null, nextHearingDate: null, caseStage: null, courtNumberAndJudge: null },
            parties: { petitioner: { name: null, advocate: null }, respondent: { name: null, advocate: null } },
            caseHistory: [],
            interimOrders: []
          };
        }

        console.log(`[eCourts] CAPTCHA failed or page not loaded, retrying...`);

      } catch (error) {
        console.error(`[eCourts] Attempt ${attempt + 1} failed:`, error);
        if (attempt === MAX_RETRIES - 1) throw error;
      }
    }

    throw new Error('All extraction attempts failed');

  } finally {
    await browser.close();
  }
}

export function parseOrderDate(dateStr: string): Date | null {
  const formats = [
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[2]) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      }
    }
  }
  return null;
}
