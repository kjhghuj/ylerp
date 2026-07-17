"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureJsonBodyParsing = exports.productAtomicRouteErrorHandler = exports.productAtomicJsonErrorHandler = exports.legacyJsonParserWithAtomicSkip = exports.productAtomicJsonParser = exports.isProductAtomicWriteRequest = exports.LEGACY_JSON_RAW_BODY_LIMIT = exports.PRODUCT_ATOMIC_RAW_BODY_LIMIT = void 0;
const express_1 = __importDefault(require("express"));
exports.PRODUCT_ATOMIC_RAW_BODY_LIMIT = '2mb';
exports.LEGACY_JSON_RAW_BODY_LIMIT = '100mb';
const isProductAtomicWriteRequest = (method, path) => {
    const normalizedMethod = method.toUpperCase();
    if (normalizedMethod === 'POST') {
        return /^\/api\/products\/with-templates\/?$/i.test(path);
    }
    if (normalizedMethod === 'PUT') {
        return /^\/api\/products\/[^/]+\/with-templates\/?$/i.test(path);
    }
    return false;
};
exports.isProductAtomicWriteRequest = isProductAtomicWriteRequest;
const atomicJsonParser = express_1.default.json({ limit: exports.PRODUCT_ATOMIC_RAW_BODY_LIMIT });
const legacyJsonParser = express_1.default.json({ limit: exports.LEGACY_JSON_RAW_BODY_LIMIT });
const productAtomicJsonParser = (req, res, next) => {
    if (!(0, exports.isProductAtomicWriteRequest)(req.method, req.path))
        return next();
    return atomicJsonParser(req, res, next);
};
exports.productAtomicJsonParser = productAtomicJsonParser;
const legacyJsonParserWithAtomicSkip = (req, res, next) => {
    if ((0, exports.isProductAtomicWriteRequest)(req.method, req.path))
        return next();
    return legacyJsonParser(req, res, next);
};
exports.legacyJsonParserWithAtomicSkip = legacyJsonParserWithAtomicSkip;
const productAtomicJsonErrorHandler = (error, req, res, next) => {
    if (!(0, exports.isProductAtomicWriteRequest)(req.method, req.path))
        return next(error);
    if (error.status === 413 || error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large' });
    }
    if (error.status === 400 || error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (error.status === 415) {
        return res.status(415).json({ error: 'Unsupported request body' });
    }
    return next(error);
};
exports.productAtomicJsonErrorHandler = productAtomicJsonErrorHandler;
const productAtomicRouteErrorHandler = (error, req, res, next) => {
    if ((error instanceof URIError || error.name === 'URIError') &&
        (0, exports.isProductAtomicWriteRequest)(req.method, req.path)) {
        return res.status(400).json({ error: 'Invalid product request path' });
    }
    return next(error);
};
exports.productAtomicRouteErrorHandler = productAtomicRouteErrorHandler;
const configureJsonBodyParsing = (app) => {
    app.use(exports.productAtomicJsonParser);
    app.use(exports.legacyJsonParserWithAtomicSkip);
    app.use(exports.productAtomicJsonErrorHandler);
};
exports.configureJsonBodyParsing = configureJsonBodyParsing;
