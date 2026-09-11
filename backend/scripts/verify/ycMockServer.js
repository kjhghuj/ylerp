/**
 * 本地验证用 YC（元仓）开放平台 mock 服务。
 * 仅用于浏览器验证流程，明确非真实联调：实现 login / customerWarehouse / product/list /
 * stock/list / inOrder/list / inOrder/detail 六个端点，返回确定性的测试数据。
 * 用法：node scripts/verify/ycMockServer.js  （默认监听 15999）
 */
const http = require('http');

const PORT = Number(process.env.YC_MOCK_PORT || 15999);

const warehouses = [
  { code: 'WH-MY-MAIN', siteCode: 'MY', name: '马来西亚主仓' },
  { code: 'WH-MY-SEC', siteCode: 'MY', name: '马来西亚二仓' },
];

const products = [
  { customerSku: 'KB-BLACK-01', customerSkuName: '机械键盘 黑色' },
  { customerSku: 'KB-WHITE-01', customerSkuName: '机械键盘 白色' },
  { customerSku: 'MOUSE-PRO-02', customerSkuName: '无线鼠标 Pro' },
  { customerSku: 'CABLE-C-1M', customerSkuName: '数据线 C to C 1米' },
];

const stockRows = [
  { warehouseCode: 'WH-MY-MAIN', warehouseName: '马来西亚主仓', siteCode: 'MY', customerSku: 'KB-BLACK-01', customerSkuName: '机械键盘 黑色', available: 120, inventory: 150, occupy: 30, unshipped: 0, prepare: 0, transfer: 0, waitShelf: 0 },
  { warehouseCode: 'WH-MY-SEC', warehouseName: '马来西亚二仓', siteCode: 'MY', customerSku: 'KB-BLACK-01', customerSkuName: '机械键盘 黑色', available: 30, inventory: 30, occupy: 0, unshipped: 0, prepare: 0, transfer: 0, waitShelf: 0 },
  { warehouseCode: 'WH-MY-MAIN', warehouseName: '马来西亚主仓', siteCode: 'MY', customerSku: 'KB-WHITE-01', customerSkuName: '机械键盘 白色', available: 0, inventory: 0, occupy: 0, unshipped: 0, prepare: 0, transfer: 0, waitShelf: 0 },
  { warehouseCode: 'WH-MY-MAIN', warehouseName: '马来西亚主仓', siteCode: 'MY', customerSku: 'MOUSE-PRO-02', customerSkuName: '无线鼠标 Pro', available: 65, inventory: 70, occupy: 5, unshipped: 0, prepare: 0, transfer: 0, waitShelf: 0 },
  // CABLE-C-1M：刻意不返回库存行 → 验证「库存未知 ≠ 零库存」
];

const inboundOrders = [
  {
    warehouseOrderNo: 'YC-IN-2026-001', customerWarehouseOrderNo: 'PO-2026-001', status: 2,
    destinationWarehouseCode: 'WH-MY-MAIN', estimatedArrivalDate: '2026-09-14',
    details: [{ customerSku: 'KB-BLACK-01', productSku: 'SKU-KB1', quantity: 200, shiftNum: 0, estimatedArrivalDate: '2026-09-14' }],
  },
  {
    warehouseOrderNo: 'YC-IN-2026-002', customerWarehouseOrderNo: 'PO-2026-002', status: 2,
    destinationWarehouseCode: 'WH-MY-MAIN', estimatedArrivalDate: null,
    details: [{ customerSku: 'MOUSE-PRO-02', productSku: 'SKU-MP2', quantity: 80, shiftNum: 0 }],
  },
  {
    warehouseOrderNo: 'YC-IN-2026-003', customerWarehouseOrderNo: 'PO-2026-003', status: 4,
    destinationWarehouseCode: 'WH-MY-MAIN', estimatedArrivalDate: '2026-09-10',
    details: [{ customerSku: 'KB-WHITE-01', productSku: 'SKU-KW1', quantity: 500, shiftNum: 0 }],
  },
];

const ok = data => JSON.stringify({ state: '000001', msg: 'ok', data });
const listPage = (list, page, prePage) => JSON.stringify({
  state: '000001', msg: 'ok',
  data: { list: list.slice((page - 1) * prePage, page * prePage), total: list.length, page, prePage },
});

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { /* ignore */ }
    const page = Number(payload.page || 1);
    const prePage = Number(payload.prePage || 100);
    res.setHeader('Content-Type', 'application/json');

    if (req.url.endsWith('/authorization/login')) {
      res.end(ok({ token: 'mock-token-verify', tokenType: 'Bearer' }));
      return;
    }
    if (req.url.endsWith('/baseData/customerWarehouse')) {
      res.end(ok(warehouses));
      return;
    }
    if (req.url.endsWith('/product/list')) {
      res.end(listPage(products, page, prePage));
      return;
    }
    if (req.url.endsWith('/stock/list')) {
      const skus = Array.isArray(payload.customerSku) ? payload.customerSku : [];
      const warehouseCode = payload.warehouseCode;
      const rows = stockRows.filter(row =>
        (skus.length === 0 || skus.includes(row.customerSku))
        && (!warehouseCode || row.warehouseCode === warehouseCode));
      res.end(listPage(rows, page, prePage));
      return;
    }
    if (req.url.endsWith('/inOrder/list')) {
      const code = payload.destinationWarehouseCode;
      const rows = code ? inboundOrders.filter(order => order.destinationWarehouseCode === code) : inboundOrders;
      const { details, ...listable } = rows[0] || {};
      res.end(listPage(rows.map(order => {
        const { details: drop, ...rest } = order;
        return rest;
      }), page, prePage));
      return;
    }
    if (req.url.endsWith('/inOrder/detail')) {
      const order = inboundOrders.find(entry => entry.customerWarehouseOrderNo === payload.customerWarehouseOrderNo);
      if (!order) { res.end(ok({ details: [] })); return; }
      res.end(ok({ warehouseOrderNo: order.warehouseOrderNo, status: order.status, estimatedArrivalDate: order.estimatedArrivalDate, details: order.details }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ state: '999999', msg: `unknown path ${req.url}` }));
  });
});

server.listen(PORT, () => {
  console.log(`YC mock server listening on http://localhost:${PORT} （验证专用测试数据）`);
});
