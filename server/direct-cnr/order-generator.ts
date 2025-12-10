import { db } from '../db';
import { directCnrOrders, directCnrCases, districts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DirectCnrOrder, InsertDirectCnrOrder } from '@shared/schema';
import { parseCNR } from './case-manager';

export interface OrderUrlParams {
  cnr: string;
  orderNo: number;
  orderDate: string;
  baseUrl: string;
}

export function generateOrderUrl(params: OrderUrlParams): { url: string; encodedPayload: string } {
  const { cnr, orderNo, orderDate, baseUrl } = params;
  
  const [day, month, year] = orderDate.split(/[-\/]/);
  const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  const payloadObj = {
    cino: cnr,
    order_no: orderNo,
    order_date: formattedDate
  };
  const encodedPayload = Buffer.from(JSON.stringify(payloadObj)).toString('base64');
  
  const url = `${baseUrl}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=${encodeURIComponent(encodedPayload)}`;
  
  return { url, encodedPayload };
}

export function generateOrderUrlFromComponents(
  districtBaseUrl: string,
  cnr: string,
  orderNo: number,
  orderDate: Date
): { url: string; encodedPayload: string } {
  const day = orderDate.getDate().toString().padStart(2, '0');
  const month = (orderDate.getMonth() + 1).toString().padStart(2, '0');
  const year = orderDate.getFullYear();
  const formattedDate = `${year}-${month}-${day}`;
  
  const payloadObj = {
    cino: cnr,
    order_no: orderNo,
    order_date: formattedDate
  };
  const encodedPayload = Buffer.from(JSON.stringify(payloadObj)).toString('base64');
  
  const url = `${districtBaseUrl}/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=${encodeURIComponent(encodedPayload)}`;
  
  return { url, encodedPayload };
}

export async function createOrder(data: InsertDirectCnrOrder): Promise<DirectCnrOrder> {
  const [order] = await db.insert(directCnrOrders)
    .values(data)
    .returning();
  return order;
}

export async function getOrderById(id: number): Promise<DirectCnrOrder | null> {
  const [order] = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.id, id))
    .limit(1);
  return order || null;
}

export async function getOrdersByCase(caseId: number): Promise<DirectCnrOrder[]> {
  return db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId));
}

export async function getOrdersNeedingPdfDownload(caseId: number): Promise<DirectCnrOrder[]> {
  return db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId))
    .then(orders => orders.filter(o => !o.pdfExists && o.retryCount < 3));
}

export async function getOrdersNeedingTextExtraction(caseId: number): Promise<DirectCnrOrder[]> {
  return db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId))
    .then(orders => orders.filter(o => o.pdfExists && !o.textExtracted));
}

export async function getOrdersNeedingClassification(caseId: number): Promise<DirectCnrOrder[]> {
  return db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.caseId, caseId))
    .then(orders => orders.filter(o => o.textExtracted && !o.classificationDone));
}

export async function updateOrderPdfStatus(
  orderId: number,
  pdfExists: boolean,
  pdfPath?: string,
  pdfSizeBytes?: number,
  httpStatusCode?: number,
  errorMessage?: string
): Promise<void> {
  let retryCount = 0;
  
  if (!pdfExists) {
    const [currentOrder] = await db.select()
      .from(directCnrOrders)
      .where(eq(directCnrOrders.id, orderId))
      .limit(1);
    retryCount = (currentOrder?.retryCount || 0) + 1;
  }
  
  await db.update(directCnrOrders)
    .set({
      pdfExists,
      pdfPath: pdfPath || null,
      pdfSizeBytes: pdfSizeBytes || null,
      httpStatusCode: httpStatusCode || null,
      errorMessage: errorMessage || null,
      lastAttemptAt: new Date(),
      retryCount,
      updatedAt: new Date()
    })
    .where(eq(directCnrOrders.id, orderId));
}

export async function incrementOrderRetryCount(orderId: number, errorMessage: string): Promise<void> {
  const [order] = await db.select()
    .from(directCnrOrders)
    .where(eq(directCnrOrders.id, orderId))
    .limit(1);
  
  if (order) {
    await db.update(directCnrOrders)
      .set({
        retryCount: order.retryCount + 1,
        lastAttemptAt: new Date(),
        errorMessage,
        updatedAt: new Date()
      })
      .where(eq(directCnrOrders.id, orderId));
  }
}

export async function markOrderTextExtracted(orderId: number): Promise<void> {
  await db.update(directCnrOrders)
    .set({
      textExtracted: true,
      updatedAt: new Date()
    })
    .where(eq(directCnrOrders.id, orderId));
}

export async function markOrderClassified(orderId: number): Promise<void> {
  await db.update(directCnrOrders)
    .set({
      classificationDone: true,
      summaryGenerated: true,
      updatedAt: new Date()
    })
    .where(eq(directCnrOrders.id, orderId));
}

export async function createOrdersFromECourtsData(
  caseId: number,
  cnr: string,
  baseUrl: string,
  interimOrders: Array<{ orderNumber: number; orderDate: string; orderDetails?: string | null }>
): Promise<DirectCnrOrder[]> {
  const createdOrders: DirectCnrOrder[] = [];

  for (const orderData of interimOrders) {
    const parsedDate = parseOrderDate(orderData.orderDate);
    if (!parsedDate) {
      console.warn(`[OrderGenerator] Could not parse date: ${orderData.orderDate}`);
      continue;
    }

    const { url, encodedPayload } = generateOrderUrlFromComponents(
      baseUrl,
      cnr,
      orderData.orderNumber,
      parsedDate
    );

    const existingOrders = await db.select()
      .from(directCnrOrders)
      .where(eq(directCnrOrders.caseId, caseId));
    
    const isDuplicate = existingOrders.some(
      o => o.orderNo === orderData.orderNumber && 
           o.orderDate === formatDateForDb(parsedDate)
    );

    if (isDuplicate) {
      console.log(`[OrderGenerator] Skipping duplicate order: ${orderData.orderNumber} on ${orderData.orderDate}`);
      continue;
    }

    const [order] = await db.insert(directCnrOrders)
      .values({
        caseId,
        orderNo: orderData.orderNumber,
        orderDate: formatDateForDb(parsedDate),
        url,
        encodedPayload,
        discoveredFrom: 'initial_sync'
      })
      .returning();

    createdOrders.push(order);
  }

  return createdOrders;
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

function formatDateForDb(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
