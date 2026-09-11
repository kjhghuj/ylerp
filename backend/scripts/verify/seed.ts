/**
 * 本地验证种子数据（明确标注的测试数据，非真实联调）：
 * - owner 账号 verify / verify123456（bcrypt）
 * - YC mock 凭据（指向 ycMockServer）
 * - 商品分析店铺「验证-马来店」+ 近 7 天上传（4 个规格货号：直连/零库存/库存未知/待核对 各一）
 * - 本地档案（KB-BLACK-01 库存+成本）、站点级映射（MOUSE-PRO-02）
 * 用法：DATABASE_URL=... npx tsx scripts/verify/seed.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { encryptSecret } from '../../src/services/ycCredentials';

const prisma = new PrismaClient();

const addDays = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86_400_000);

async function main() {
  const keySource = process.env.JWT_SECRET;
  if (!keySource) throw new Error('JWT_SECRET required for seeding YC credentials');

  const passwordHash = await bcrypt.hash('verify123456', 10);
  const user = await prisma.user.upsert({
    where: { username: 'verify' },
    update: { password: passwordHash, role: 'owner', isActive: true },
    create: {
      username: 'verify',
      password: passwordHash,
      displayName: '验证账号（测试数据）',
      role: 'owner',
      isActive: true,
      ycAppKey: 'verify-app-key',
      ycAppSecret: encryptSecret('verify-app-secret', keySource),
    },
  });
  console.log('user:', user.id);

  // 本地档案：仅 KB-BLACK-01（有库存档案与成本）；其余走元仓同码直连或待核对
  await prisma.inventoryItem.upsert({
    where: { userId_sku: { userId: user.id, sku: 'KB-BLACK-01' } },
    update: { costPerUnit: 45, name: '机械键盘 黑色（本地）' },
    create: {
      userId: user.id, name: '机械键盘 黑色（本地）', sku: 'KB-BLACK-01',
      currentStock: 0, stockOfficial: 0, stockThirdParty: 0, inTransit: 0,
      dailySales: 0, leadTime: 25, replenishCycle: 30, costPerUnit: 45,
    },
  });
  await prisma.product.upsert({
    where: { userId_sku: { userId: user.id, sku: 'KB-BLACK-01' } },
    update: {},
    create: {
      userId: user.id, name: '机械键盘 黑色（本地）', sku: 'KB-BLACK-01', country: 'MY',
      sites: ['MY'], cost: 45, productWeight: 0.8, supplierTaxPoint: 0,
      supplierInvoice: 'no', sellerCouponType: 'fixed', sellerCoupon: 0,
      sellerCouponPlatformRatio: 0, adROI: 15, totalRevenue: 0, platformInfrastructureFee: 0,
    },
  });

  // 站点级映射：平台规格货号 MOUSE-LOCAL-9 → 本地 SKU MOUSE-PRO-02（元仓同码场景另行验证）
  await prisma.inventoryItem.upsert({
    where: { userId_sku: { userId: user.id, sku: 'MOUSE-PRO-02' } },
    update: {},
    create: {
      userId: user.id, name: '无线鼠标 Pro（本地）', sku: 'MOUSE-PRO-02',
      currentStock: 0, stockOfficial: 0, stockThirdParty: 0, inTransit: 0,
      dailySales: 0, leadTime: 25, replenishCycle: 30, costPerUnit: 22,
    },
  });
  await prisma.externalSkuMapping.upsert({
    where: { userId_site_externalSku_externalSkuType: { userId: user.id, site: 'MY', externalSku: 'MOUSE-LOCAL-9', externalSkuType: 'legacy' } },
    update: { targetSku: 'MOUSE-PRO-02' },
    create: { userId: user.id, site: 'MY', externalSku: 'MOUSE-LOCAL-9', externalSkuType: 'legacy', targetSku: 'MOUSE-PRO-02' },
  });

  // 库存池
  await prisma.restockStockPool.upsert({
    where: { userId_name: { userId: user.id, name: '验证-主仓池' } },
    update: { warehouseCodes: ['WH-MY-MAIN'] },
    create: { userId: user.id, name: '验证-主仓池', site: 'MY', warehouseCodes: ['WH-MY-MAIN'] },
  });

  // 商品分析店铺 + 近 7 天上传
  const shop = await prisma.productAnalysisShop.upsert({
    where: { userId_name: { userId: user.id, name: '验证-马来店' } },
    update: {},
    create: { userId: user.id, name: '验证-马来店', site: 'MY', platform: 'shopee', currency: 'MYR' },
  });

  const today = new Date().toISOString().slice(0, 10);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const dateKey = date.toISOString().slice(0, 10);
    const upload = await prisma.productAnalysisDailyUpload.upsert({
      where: { shopId_date_version: { shopId: shop.id, date, version: 1 } },
      update: {},
      create: {
        shopId: shop.id, date, fileName: `验证上传_${dateKey}.xlsx`,
        currency: 'MYR', itemCount: 3, userId: user.id,
      },
    });
    // 件数随 offset 变化，保证正/零/缺测组合：
    // KB-BLACK-01（本地档案+映射自身）、KB-WHITE-01（元仓确认零库存）、
    // CABLE-C-1M（元仓无库存行→库存未知）、NO-CODE-77（无元仓同码→待核对）
    await prisma.productDailyItem.upsert({
      where: { uploadId_itemId: { uploadId: upload.id, itemId: '9001' } },
      update: {},
      create: {
        uploadId: upload.id, itemId: '9001', itemName: '机械键盘', sheetKey: 'valid',
        unitsOrdered: 6 + (6 - offset),
        variations: [
          { variationSku: 'SYS-KB1', modelCode: 'KB-BLACK-01', variationName: '黑色', unitsOrdered: 4 + (6 - offset) },
          { variationSku: 'SYS-KW1', modelCode: 'KB-WHITE-01', variationName: '白色', unitsOrdered: offset % 3 === 0 ? 0 : 2 },
        ],
      },
    });
    await prisma.productDailyItem.upsert({
      where: { uploadId_itemId: { uploadId: upload.id, itemId: '9002' } },
      update: {},
      create: {
        uploadId: upload.id, itemId: '9002', itemName: '数据线', sheetKey: 'valid',
        unitsOrdered: 3, salesOrdered: 3,
        variations: [
          { variationSku: 'SYS-CC1', modelCode: 'CABLE-C-1M', variationName: '1米', unitsOrdered: offset === 4 ? null : 3 },
        ],
      },
    });
    await prisma.productDailyItem.upsert({
      where: { uploadId_itemId: { uploadId: upload.id, itemId: '9003' } },
      update: {},
      create: {
        uploadId: upload.id, itemId: '9003', itemName: '未知挂件', sheetKey: 'valid',
        unitsOrdered: 1,
        variations: [
          { variationSku: 'SYS-NC7', modelCode: 'NO-CODE-77', variationName: '蓝色', unitsOrdered: 1 },
        ],
      },
    });
  }

  console.log('seed done: shop', shop.id);
}

main()
  .catch(error => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
