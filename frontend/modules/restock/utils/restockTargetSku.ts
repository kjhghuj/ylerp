export interface RestockTargetSku {
  id: string;
  sku: string;
  name?: string;
}

export interface RankedRestockTargetSku extends RestockTargetSku {
  matchPercentage?: number;
}

const normalizeSku = (value: string) =>
  value.replace(/\t/g, "").trim().toUpperCase();
const compactSku = (value: string) =>
  normalizeSku(value).replace(/[^A-Z0-9]/g, "");

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const commonPrefixLength = (left: string, right: string) => {
  let index = 0;
  while (
    index < left.length &&
    index < right.length &&
    left[index] === right[index]
  )
    index += 1;
  return index;
};

const similarityScore = (sourceSku: string, targetSku: string) => {
  const source = compactSku(sourceSku);
  const target = compactSku(targetSku);
  if (!source) return 0;
  if (normalizeSku(sourceSku) === normalizeSku(targetSku)) return 1_000_000;
  if (source === target) return 900_000;
  const prefix = commonPrefixLength(source, target);
  const distance = levenshteinDistance(source, target);
  return (
    prefix * 10_000 - distance * 100 - Math.abs(source.length - target.length)
  );
};

export const getRestockSkuMatchPercentage = (
  sourceSku: string,
  targetSku: string,
): number => {
  const source = compactSku(sourceSku);
  const target = compactSku(targetSku);
  if (!source || !target) return 0;
  if (normalizeSku(sourceSku) === normalizeSku(targetSku) || source === target)
    return 100;

  const distance = levenshteinDistance(source, target);
  const similarity = 1 - distance / Math.max(source.length, target.length);
  return Math.max(0, Math.min(99, Math.round(similarity * 100)));
};

/**
 * This only orders candidates. It deliberately never returns a selected SKU or
 * uses product names/specifications, so every mapping remains user-confirmed.
 */
export const rankRestockTargetSkus = (
  sourceSku: string,
  candidates: RestockTargetSku[],
  search = "",
): RankedRestockTargetSku[] => {
  const query = normalizeSku(search);
  return candidates
    .filter(
      (candidate) => !query || normalizeSku(candidate.sku).includes(query),
    )
    .map((candidate) => ({
      candidate,
      score: similarityScore(sourceSku, candidate.sku),
      matchPercentage: getRestockSkuMatchPercentage(sourceSku, candidate.sku),
    }))
    .sort(
      (left, right) =>
        right.matchPercentage - left.matchPercentage ||
        right.score - left.score ||
        left.candidate.sku.localeCompare(right.candidate.sku),
    )
    .map(({ candidate, matchPercentage }) => ({
      ...candidate,
      matchPercentage,
    }));
};
