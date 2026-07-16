"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductListCacheKey = exports.PRODUCT_LIST_CACHE_VERSION = void 0;
exports.PRODUCT_LIST_CACHE_VERSION = 'v2';
const getProductListCacheKey = (userId) => (`products:${exports.PRODUCT_LIST_CACHE_VERSION}:${userId}`);
exports.getProductListCacheKey = getProductListCacheKey;
