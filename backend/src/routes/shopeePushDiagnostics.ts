import { writeFileSync } from 'fs';
import path from 'path';
import { RequestHandler } from 'express';

interface PushDiagnostic {
  time: string;
  method: string;
  status: number;
  reason: string;
  signatureFormat: 'missing' | 'hex64' | 'prefixed_hex64' | 'other';
  contentType: 'json' | 'missing' | 'other';
  rawBodyBytes: number | null;
}

const recentRequests: PushDiagnostic[] = [];

// Opt-in local diagnostics: never record body, signature, URL query, or secrets.
export const observeShopeePush: RequestHandler = (req, res, next) => {
  if (process.env.SHOPEE_PUSH_DIAGNOSTICS !== '1') return next();
  const outputPath = process.env.SHOPEE_PUSH_DIAGNOSTICS_FILE
    || path.resolve(__dirname, '../../.shopee-push-diagnostics.json');
  res.once('finish', () => {
    const signature = req.get('authorization') || '';
    recentRequests.push({
      time: new Date().toISOString(),
      method: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'].includes(req.method) ? req.method : 'OTHER',
      status: res.statusCode,
      reason: res.locals.shopeePushResult || (res.statusCode === 404 ? 'route_not_found' : 'unknown'),
      signatureFormat: !signature ? 'missing' : /^[a-f0-9]{64}$/i.test(signature) ? 'hex64'
        : /^SHA256 [a-f0-9]{64}$/i.test(signature) ? 'prefixed_hex64' : 'other',
      contentType: !req.get('content-type') ? 'missing' : req.is('application/json') ? 'json' : 'other',
      rawBodyBytes: Buffer.isBuffer(req.body) ? req.body.length : null,
    });
    if (recentRequests.length > 20) recentRequests.shift();
    try {
      writeFileSync(outputPath, JSON.stringify(recentRequests, null, 2), { mode: 0o600 });
    } catch {
      // Diagnostics must not alter webhook delivery or expose filesystem errors.
    }
  });
  next();
};
