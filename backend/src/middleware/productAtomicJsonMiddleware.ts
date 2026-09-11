import express, {
  Application,
  ErrorRequestHandler,
  RequestHandler,
} from 'express';

export const PRODUCT_ATOMIC_RAW_BODY_LIMIT = '2mb';
export const LEGACY_JSON_RAW_BODY_LIMIT = '2mb';
export const CHROMA_JSON_RAW_BODY_LIMIT = '15mb';
export const PRODUCT_ANALYSIS_UPLOAD_RAW_BODY_LIMIT = '64mb';

export const isBoundedProfitTemplateWriteRequest = (
  method: string,
  path: string,
): boolean => {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'POST') {
    return (
      /^\/api\/products\/with-templates\/?$/i.test(path) ||
      /^\/api\/products\/[^/]+\/templates\/?$/i.test(path) ||
      /^\/api\/templates\/?$/i.test(path)
    );
  }
  if (normalizedMethod === 'PUT') {
    return (
      /^\/api\/products\/[^/]+\/with-templates\/?$/i.test(path) ||
      /^\/api\/products\/[^/]+\/templates\/[^/]+(?:\/primary)?\/?$/i.test(path) ||
      /^\/api\/templates\/[^/]+\/?$/i.test(path)
    );
  }
  return false;
};

export const isProductAtomicWriteRequest = isBoundedProfitTemplateWriteRequest;

const atomicJsonParser = express.json({ limit: PRODUCT_ATOMIC_RAW_BODY_LIMIT });
const legacyJsonParser = express.json({ limit: LEGACY_JSON_RAW_BODY_LIMIT });
export const chromaJsonParser = express.json({ limit: CHROMA_JSON_RAW_BODY_LIMIT });

const isChromaRequest = (path: string): boolean => /^\/api\/chroma-(?:adapt|data)(?:\/|$)/i.test(path);
const isProductAnalysisUploadRequest = (method: string, path: string): boolean => (
  method.toUpperCase() === 'POST'
  && /^\/(?:api\/product-analysis\/)?shops\/[^/]+\/daily-uploads\/?$/i.test(path)
);
const productAnalysisUploadParser = express.json({ limit: PRODUCT_ANALYSIS_UPLOAD_RAW_BODY_LIMIT });

export const productAnalysisUploadJsonParser: RequestHandler = (req, res, next) => {
  if (!isProductAnalysisUploadRequest(req.method, req.path)) return next();
  return productAnalysisUploadParser(req, res, next);
};

export const productAtomicJsonParser: RequestHandler = (req, res, next) => {
  if (!isBoundedProfitTemplateWriteRequest(req.method, req.path)) return next();
  return atomicJsonParser(req, res, next);
};

export const legacyJsonParserWithAtomicSkip: RequestHandler = (req, res, next) => {
  if (isBoundedProfitTemplateWriteRequest(req.method, req.path) || isChromaRequest(req.path) || isProductAnalysisUploadRequest(req.method, req.path)) return next();
  return legacyJsonParser(req, res, next);
};

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

export const productAtomicJsonErrorHandler: ErrorRequestHandler = (
  error: BodyParserError,
  req,
  res,
  next,
) => {
  if (!isBoundedProfitTemplateWriteRequest(req.method, req.path)) return next(error);
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

export const productAtomicRouteErrorHandler: ErrorRequestHandler = (
  error: Error,
  req,
  res,
  next,
) => {
  if (
    (error instanceof URIError || error.name === 'URIError') &&
    isBoundedProfitTemplateWriteRequest(req.method, req.path)
  ) {
    return res.status(400).json({ error: 'Invalid product request path' });
  }
  return next(error);
};

export const chromaJsonErrorHandler: ErrorRequestHandler = (error: BodyParserError, _req, res, next) => {
  if (error.status === 413 || error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (error.status === 400 || error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return next(error);
};

export const configureJsonBodyParsing = (app: Application): void => {
  app.use(productAtomicJsonParser);
  app.use(legacyJsonParserWithAtomicSkip);
  app.use(productAtomicJsonErrorHandler);
};
