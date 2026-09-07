"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.observeShopeePush = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const recentRequests = [];
// Opt-in local diagnostics: never record body, signature, URL query, or secrets.
const observeShopeePush = (req, res, next) => {
    if (process.env.SHOPEE_PUSH_DIAGNOSTICS !== '1')
        return next();
    const outputPath = process.env.SHOPEE_PUSH_DIAGNOSTICS_FILE
        || path_1.default.resolve(__dirname, '../../.shopee-push-diagnostics.json');
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
        if (recentRequests.length > 20)
            recentRequests.shift();
        try {
            (0, fs_1.writeFileSync)(outputPath, JSON.stringify(recentRequests, null, 2), { mode: 0o600 });
        }
        catch {
            // Diagnostics must not alter webhook delivery or expose filesystem errors.
        }
    });
    next();
};
exports.observeShopeePush = observeShopeePush;
