import './config/environment';
import express from 'express';
import cors from 'cors';
import { prisma } from './infrastructure/runtimeResources';
import { parseTrustedProxyCidrs } from './services/trustedProxy';
import { assertJwtSecretConfigured } from './services/jwtSecret';
import { guardAiRequest } from './middleware/aiRequestGuard';
import { authenticate, authorize, authorizeAnyPermission } from './middleware/authMiddleware';
import { ShopeeAuthorizationService } from './services/shopeeAuthorization';
import { configureShopeeAuthorization, createShopeeManagementRoutes } from './routes/shopeeAuthorizationRoutes';
import {
  configureJsonBodyParsing,
  chromaJsonErrorHandler,
  chromaJsonParser,
  productAnalysisUploadJsonParser,
  productAtomicRouteErrorHandler,
} from './middleware/productAtomicJsonMiddleware';
import shopeeRoutes from './routes/shopeeRoutes';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import productRoutes from './routes/productRoutes';
import productDisplayGroupRoutes from './routes/productDisplayGroupRoutes';
import financeRoutes from './routes/financeRoutes';
import nodeGraphRoutes from './routes/nodeGraphRoutes';
import templateRoutes from './routes/templateRoutes';
import chromaAdaptRoutes from './routes/chromaAdaptRoutes';
import restockV2Routes from './routes/restockV2Routes';
import restockV3Routes from './routes/restockV3Routes';
import scheduleRoutes from './routes/scheduleRoutes';
import chromaRecordRoutes from './routes/chromaRecordRoutes';
import usageRoutes from './routes/usageRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import productAnalysisRoutes from './routes/productAnalysisRoutes';
import productAnalysisCollectionRoutes from './routes/productAnalysisCollectionRoutes';
import productAnalysisImportRoutes from './routes/productAnalysisImportRoutes';

/** Assemble the HTTP application without starting a server, database connection or worker. */
export function createApp(options: { shopeeAuthorization?: ShopeeAuthorizationService } = {}) {
  assertJwtSecretConfigured();
  const app = express();
  app.set('trust proxy', parseTrustedProxyCidrs(process.env.TRUSTED_PROXY_CIDRS));
  app.use(cors());
  // Shopee verifies signatures over the raw body, before general JSON parsing.
  app.use('/api/shopee', shopeeRoutes);
  configureJsonBodyParsing(app);

  app.use('/api/auth', authRoutes);
  const shopeeAuthorization = options.shopeeAuthorization ?? new ShopeeAuthorizationService(prisma);
  configureShopeeAuthorization(shopeeAuthorization);
  app.use('/api/shopee/manage', authenticate, authorize('owner'), createShopeeManagementRoutes(shopeeAuthorization));
  app.use('/api/users', userRoutes);
  app.use('/api/products', authenticate, productRoutes);
  app.use('/api/product-display-groups', authenticate, productDisplayGroupRoutes);
  app.use(productAtomicRouteErrorHandler);
  app.use('/api/finance', authenticate, financeRoutes);
  app.use('/api/templates', authenticate, templateRoutes);
  app.use('/api/restock-v2', authenticate, restockV2Routes);
  app.use('/api/restock-v3', authenticate, restockV3Routes);
  app.use('/api/schedule', authenticate, scheduleRoutes);
  app.use('/api/node-graphs', authenticate, nodeGraphRoutes);
  app.use('/api/chroma-adapt', authenticate, chromaJsonParser, chromaJsonErrorHandler, guardAiRequest, chromaAdaptRoutes);
  app.use('/api/chroma-data', authenticate, authorizeAnyPermission('chroma-adapt.translate', 'chroma-adapt.edit', 'chroma-adapt.generate'), chromaJsonParser, chromaJsonErrorHandler, chromaRecordRoutes);
  app.use('/api/usage', usageRoutes);
  app.use('/api/dashboard', authenticate, dashboardRoutes);
  app.use('/api/product-analysis', authenticate, productAnalysisUploadJsonParser, chromaJsonErrorHandler, guardAiRequest, productAnalysisRoutes);
  app.use('/api/product-analysis', authenticate, productAnalysisCollectionRoutes);
  app.use('/api/imports', productAnalysisImportRoutes);
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  return app;
}
