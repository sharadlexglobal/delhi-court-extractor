import { Request, Response, NextFunction } from 'express';

const requestCounts = new Map<string, { count: number; resetTime: number }>();
const heavyRequestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const HEAVY_OPERATION_LIMIT = 5;

let schedulerLock = false;
let schedulerLockTime: number | null = null;
const SCHEDULER_LOCK_TIMEOUT_MS = 300000;

export function rateLimit(maxRequests: number = RATE_LIMIT_MAX_REQUESTS) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const clientData = requestCounts.get(clientIp);

    if (!clientData || now > clientData.resetTime) {
      requestCounts.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
      return next();
    }

    if (clientData.count >= maxRequests) {
      console.warn(`[RateLimit] Limit exceeded for ${clientIp}`);
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }

    clientData.count++;
    next();
  };
}

export function heavyOperationLimit(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const clientData = heavyRequestCounts.get(clientIp);

  if (!clientData || now > clientData.resetTime) {
    heavyRequestCounts.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (clientData.count >= HEAVY_OPERATION_LIMIT) {
    console.warn(`[RateLimit] Heavy operation limit exceeded for ${clientIp}`);
    return res.status(429).json({
      success: false,
      error: 'Too many extraction/processing requests. Please wait before trying again.',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
    });
  }

  clientData.count++;
  next();
}

export function acquireSchedulerLock(): boolean {
  const now = Date.now();

  if (schedulerLock && schedulerLockTime && (now - schedulerLockTime) < SCHEDULER_LOCK_TIMEOUT_MS) {
    console.log('[Scheduler] Lock already held, skipping execution');
    return false;
  }

  schedulerLock = true;
  schedulerLockTime = now;
  console.log('[Scheduler] Lock acquired');
  return true;
}

export function releaseSchedulerLock(): void {
  schedulerLock = false;
  schedulerLockTime = null;
  console.log('[Scheduler] Lock released');
}

export function isSchedulerLocked(): boolean {
  const now = Date.now();

  if (schedulerLock && schedulerLockTime && (now - schedulerLockTime) >= SCHEDULER_LOCK_TIMEOUT_MS) {
    schedulerLock = false;
    schedulerLockTime = null;
    console.warn('[Scheduler] Lock expired, releasing');
  }

  return schedulerLock;
}

export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    const sensitivePatterns = [
      /api[_-]?key/i,
      /secret/i,
      /password/i,
      /token/i,
      /authorization/i,
      /zenrows/i,
      /openai/i,
      /proxy/i,
      /internal server/i
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(message)) {
        return 'An error occurred while processing your request';
      }
    }

    if (message.length > 200) {
      return message.substring(0, 200) + '...';
    }

    return message;
  }

  return 'An unexpected error occurred';
}

export function validateRequiredEnvVars(): void {
  const required = ['DATABASE_URL'];
  const optional = ['OPENAI_API_KEY', 'ZENROWS_API_KEY'];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const missingOptional = optional.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn(`[Config] Optional env vars not set: ${missingOptional.join(', ')}`);
  }
}

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(requestCounts.entries());
  for (const [ip, data] of entries) {
    if (now > data.resetTime) {
      requestCounts.delete(ip);
    }
  }
  const heavyEntries = Array.from(heavyRequestCounts.entries());
  for (const [ip, data] of heavyEntries) {
    if (now > data.resetTime) {
      heavyRequestCounts.delete(ip);
    }
  }
}, 60000);
