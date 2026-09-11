-- 补货V3 第三轮：人工映射绑定编号类型（identityKey 贯通）。
-- 背景：同一店铺可能同时存在 modelCode=A 与 variationSku=A；旧表按字符串值为键，
-- 为 variationSku=A 保存的映射会错误作用到 modelCode=A 行（编号类型歧义）。
-- 方案：两张映射表增加 externalSkuType 列（modelCode/variationSku/item；legacy=历史行，身份未知），
-- 唯一索引扩展为 (user, scope, externalSku, externalSkuType)。旧行回填 'legacy'，不删不改任何数据；
-- 匹配链只在身份可唯一识别时使用 legacy 行，歧义时不猜测（见 restockV3Matching）。
-- V2 读写继续固定 externalSkuType='legacy'，行为与升级前完全一致。

ALTER TABLE "ExternalSkuMapping" ADD COLUMN "externalSkuType" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "RestockShopSkuMapping" ADD COLUMN "externalSkuType" TEXT NOT NULL DEFAULT 'legacy';

DROP INDEX "ExternalSkuMapping_userId_site_externalSku_key";
CREATE UNIQUE INDEX "ExternalSkuMapping_userId_site_externalSku_externalSkuType_key"
  ON "ExternalSkuMapping"("userId", "site", "externalSku", "externalSkuType");

DROP INDEX "RestockShopSkuMapping_userId_shopId_externalSku_key";
CREATE UNIQUE INDEX "RestockShopSkuMapping_userId_shopId_externalSku_externalSkuType_key"
  ON "RestockShopSkuMapping"("userId", "shopId", "externalSku", "externalSkuType");
