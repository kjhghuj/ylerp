import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { link, mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import express, { ErrorRequestHandler, RequestHandler } from 'express';

// Verify the exact bytes sent by Shopee, before the application's JSON parser.
export const shopeePushBodyParser = express.raw({
  type: 'application/json',
  limit: '256kb',
  inflate: false,
});

const getPushConfig = () => {
  const key = process.env.SHOPEE_PUSH_PARTNER_KEY?.trim();
  const callbackUrl = process.env.SHOPEE_WEBHOOK_URL?.trim();
  if (!key || !callbackUrl) return null;
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  } catch {
    return null;
  }
  return { key, callbackUrl };
};

// Acknowledge only after the notification is saved. A future sync worker can
// consume this inbox; this receiver itself never changes ERP business data.
const savePush = async (body: Buffer, callbackUrl: string): Promise<void> => {
  const inbox = process.env.SHOPEE_PUSH_INBOX_DIR
    || path.resolve(__dirname, '../../.shopee-push-inbox');
  const id = createHash('sha256').update(callbackUrl).update('|').update(body).digest('hex');
  const temporaryPath = path.join(inbox, `${id}.${randomUUID()}.tmp`);
  await mkdir(inbox, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporaryPath, body, { flag: 'wx', mode: 0o600 });
    // Publish only a complete file. An existing link means an identical push
    // has already been saved, including concurrent retries on Windows.
    try {
      await link(temporaryPath, path.join(inbox, `${id}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
};

export const receiveShopeePush: RequestHandler = async (req, res) => {
  const config = getPushConfig();
  if (!config) {
    res.locals.shopeePushResult = 'configuration_missing';
    return res.status(503).json({ error: 'Shopee push credentials or callback URL are not configured' });
  }
  if (!Buffer.isBuffer(req.body)) {
    res.locals.shopeePushResult = 'unsupported_content_type';
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  const signature = req.get('authorization') || '';
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
    res.locals.shopeePushResult = signature ? 'signature_format_invalid' : 'signature_missing';
    return res.status(401).json({ error: 'Invalid Shopee push signature' });
  }
  // Use the configured public URL, never Host/X-Forwarded-* from the caller.
  const expected = createHmac('sha256', config.key)
    .update(config.callbackUrl).update('|').update(req.body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    res.locals.shopeePushResult = 'signature_mismatch';
    return res.status(401).json({ error: 'Invalid Shopee push signature' });
  }
  try {
    const payload: unknown = JSON.parse(req.body.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      res.locals.shopeePushResult = 'invalid_json_object';
      return res.status(400).json({ error: 'Push body must be a JSON object' });
    }
  } catch {
    res.locals.shopeePushResult = 'invalid_json';
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  try {
    await savePush(req.body, config.callbackUrl);
  } catch {
    res.locals.shopeePushResult = 'storage_error';
    return res.status(503).json({ error: 'Unable to save Shopee push; please retry' });
  }
  res.locals.shopeePushResult = 'accepted';
  return res.status(200).end();
};

export const shopeePushParserErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  res.locals.shopeePushResult = 'body_parser_error';
  if (error.status === 413) return res.status(413).json({ error: 'Request body too large' });
  if (error.status === 415) return res.status(415).json({ error: 'Unsupported request encoding' });
  return res.status(400).json({ error: 'Invalid push request body' });
};
