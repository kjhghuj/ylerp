import { Router } from 'express';
import { receiveShopeePush, shopeePushBodyParser, shopeePushParserErrorHandler } from './shopeeWebhook';
import { observeShopeePush } from './shopeePushDiagnostics';
import { receiveShopeeAuthorization } from './shopeeAuthorizationRoutes';

const router = Router();

router.use('/webhook', observeShopeePush);
router.post('/webhook', shopeePushBodyParser, receiveShopeePush, shopeePushParserErrorHandler);

router.get('/callback', receiveShopeeAuthorization);

export default router;
