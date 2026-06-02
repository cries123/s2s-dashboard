export type DirectoryMakeFilter = 'All' | 'Other' | string;

const DEALERSHIP_BRANDS: Record<string, string[]> = {
  hyundai: ['Hyundai'],
  ford: ['Ford', 'Lincoln'],
  nissan: ['Nissan', 'Mazda'],
};

const brandKeywords = (brand: string) => brand.toLowerCase();

export function directoryMakeFiltersForDealership(dealershipId: string): DirectoryMakeFilter[] {
  const brands = DEALERSHIP_BRANDS[dealershipId] ?? DEALERSHIP_BRANDS.hyundai;
  return ['All', ...brands, 'Other'];
}

export function dealershipBrandKeywords(dealershipId: string): string[] {
  const brands = DEALERSHIP_BRANDS[dealershipId] ?? DEALERSHIP_BRANDS.hyundai;
  return brands.map(brandKeywords);
}

export function matchesDirectoryMakeFilter(
  make: string | undefined,
  filter: DirectoryMakeFilter,
  dealershipId: string
): boolean {
  const makeLower = make?.toLowerCase() || '';
  if (filter === 'All') return true;

  const tenantKeywords = dealershipBrandKeywords(dealershipId);

  if (filter === 'Other') {
    return !tenantKeywords.some(keyword => makeLower.includes(keyword));
  }

  return makeLower.includes(brandKeywords(filter));
}
