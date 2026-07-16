export const PRODUCT_LIST_CACHE_VERSION = 'v2';

export const getProductListCacheKey = (userId: string): string => (
  `products:${PRODUCT_LIST_CACHE_VERSION}:${userId}`
);
