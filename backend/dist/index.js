"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
exports.prisma = new client_1.PrismaClient();
exports.redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
exports.redis.on('connect', () => {
    console.log('Connected to Redis');
});
exports.redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});
// Basic structure for routes (we'll implement them next)
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const financeRoutes_1 = __importDefault(require("./routes/financeRoutes"));
const inventoryRoutes_1 = __importDefault(require("./routes/inventoryRoutes"));
const mappingRoutes_1 = __importDefault(require("./routes/mappingRoutes"));
const skuGroupRoutes_1 = __importDefault(require("./routes/skuGroupRoutes"));
const templateRoutes_1 = __importDefault(require("./routes/templateRoutes"));
app.use('/api/products', productRoutes_1.default);
app.use('/api/finance', financeRoutes_1.default);
app.use('/api/inventory', inventoryRoutes_1.default);
app.use('/api/warehouse-mappings', mappingRoutes_1.default);
app.use('/api/sku-groups', skuGroupRoutes_1.default);
app.use('/api/templates', templateRoutes_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
