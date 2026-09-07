"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopeePushParserErrorHandler = exports.receiveShopeePush = exports.shopeePushBodyParser = void 0;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
// Verify the exact bytes sent by Shopee, before the application's JSON parser.
exports.shopeePushBodyParser = express_1.default.raw({
    type: 'application/json',
    limit: '256kb',
    inflate: false,
});
const getPushConfig = () => {
    const key = process.env.SHOPEE_PUSH_PARTNER_KEY?.trim();
    const callbackUrl = process.env.SHOPEE_WEBHOOK_URL?.trim();
    if (!key || !callbackUrl)
        return null;
    try {
        const url = new URL(callbackUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash)
            return null;
    }
    catch {
        return null;
    }
    return { key, callbackUrl };
};
// Acknowledge only after the notification is saved. A future sync worker can
// consume this inbox; this receiver itself never changes ERP business data.
const savePush = async (body, callbackUrl) => {
    const inbox = process.env.SHOPEE_PUSH_INBOX_DIR
        || path_1.default.resolve(__dirname, '../../.shopee-push-inbox');
    const id = (0, crypto_1.createHash)('sha256').update(callbackUrl).update('|').update(body).digest('hex');
    const temporaryPath = path_1.default.join(inbox, `${id}.${(0, crypto_1.randomUUID)()}.tmp`);
    await (0, promises_1.mkdir)(inbox, { recursive: true, mode: 0o700 });
    try {
        await (0, promises_1.writeFile)(temporaryPath, body, { flag: 'wx', mode: 0o600 });
        // Publish only a complete file. An existing link means an identical push
        // has already been saved, including concurrent retries on Windows.
        try {
            await (0, promises_1.link)(temporaryPath, path_1.default.join(inbox, `${id}.json`));
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
    }
    finally {
        await (0, promises_1.unlink)(temporaryPath).catch(() => undefined);
    }
};
const receiveShopeePush = async (req, res) => {
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
    const expected = (0, crypto_1.createHmac)('sha256', config.key)
        .update(config.callbackUrl).update('|').update(req.body).digest();
    if (!(0, crypto_1.timingSafeEqual)(expected, Buffer.from(signature, 'hex'))) {
        res.locals.shopeePushResult = 'signature_mismatch';
        return res.status(401).json({ error: 'Invalid Shopee push signature' });
    }
    try {
        const payload = JSON.parse(req.body.toString('utf8'));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            res.locals.shopeePushResult = 'invalid_json_object';
            return res.status(400).json({ error: 'Push body must be a JSON object' });
        }
    }
    catch {
        res.locals.shopeePushResult = 'invalid_json';
        return res.status(400).json({ error: 'Invalid JSON body' });
    }
    try {
        await savePush(req.body, config.callbackUrl);
    }
    catch {
        res.locals.shopeePushResult = 'storage_error';
        return res.status(503).json({ error: 'Unable to save Shopee push; please retry' });
    }
    res.locals.shopeePushResult = 'accepted';
    return res.status(200).end();
};
exports.receiveShopeePush = receiveShopeePush;
const shopeePushParserErrorHandler = (error, _req, res, _next) => {
    res.locals.shopeePushResult = 'body_parser_error';
    if (error.status === 413)
        return res.status(413).json({ error: 'Request body too large' });
    if (error.status === 415)
        return res.status(415).json({ error: 'Unsupported request encoding' });
    return res.status(400).json({ error: 'Invalid push request body' });
};
exports.shopeePushParserErrorHandler = shopeePushParserErrorHandler;
