export type BundleTierId = 'minimum' | 'value' | 'premium';

export interface BundleLineItem {
  label: string;
  price?: number;
  isNote?: boolean;
}

export interface BundleTier {
  id: BundleTierId;
  name: string;
  items: BundleLineItem[];
  valuedAt: number;
  packageTotal: number;
}

export interface MileageBundleMenu {
  id: string;
  mileageLabel: string;
  shortLabel: string;
  tiers: BundleTier[];
  bonus: string;
}

export const HYUNDAI_BUNDLE_MENUS: MileageBundleMenu[] = [
  {
    id: '15k',
    mileageLabel: '15,000 Mile',
    shortLabel: '15K',
    bonus: 'Multi-Point Inspection & Car Wash',
    tiers: [
      {
        id: 'minimum',
        name: 'Minimum',
        valuedAt: 270,
        packageTotal: 170,
        items: [
          { label: 'Oil Change', price: 99 },
          { label: 'Tire Rotation', price: 34.95 },
          { label: 'Fuel System Cleaner', price: 38 },
          { label: 'Brake & Battery Inspection', price: 99.5 },
          { label: 'Check and Top Off Fluids', price: 0 },
          { label: 'GDS Scan for DTCs', price: 0 },
        ],
      },
      {
        id: 'value',
        name: 'Value',
        valuedAt: 405,
        packageTotal: 275,
        items: [
          { label: 'Everything in Minimum, plus:', isNote: true },
          { label: 'Cabin Air Filter', price: 70 },
          { label: 'In-Cabin Deodorizer', price: 25 },
          { label: 'Brake Line & Hose Inspection', price: 19.99 },
          { label: 'Parking Brake System Inspection', price: 19.99 },
        ],
      },
      {
        id: 'premium',
        name: 'Premium',
        valuedAt: 715,
        packageTotal: 599,
        items: [
          { label: 'Everything in Value, plus:', isNote: true },
          { label: 'GDI Service (FSC not needed if this is done)', price: 206 },
          { label: 'Balance All 4 Tires', price: 80 },
          { label: 'Battery Cleaning Service', price: 25 },
        ],
      },
    ],
  },
  {
    id: '30k',
    mileageLabel: '30,000 Mile',
    shortLabel: '30K',
    bonus: 'Multi-Point Inspection & Car Wash',
    tiers: [
      {
        id: 'minimum',
        name: 'Minimum',
        valuedAt: 270,
        packageTotal: 170,
        items: [
          { label: 'Oil Change', price: 99 },
          { label: 'Tire Rotation', price: 34.95 },
          { label: 'Fuel System Cleaner', price: 38 },
          { label: 'Brake & Battery Inspection', price: 99.5 },
          { label: 'Check and Top Off Fluids', price: 0 },
          { label: 'GDS Scan for DTCs', price: 0 },
        ],
      },
      {
        id: 'value',
        name: 'Value',
        valuedAt: 475,
        packageTotal: 355,
        items: [
          { label: 'Everything in Minimum, plus:', isNote: true },
          { label: 'Cabin Air Filter', price: 70 },
          { label: 'Engine Air Filter', price: 70 },
          { label: 'In-Cabin Deodorizer', price: 25 },
          { label: 'Inspect Exhaust System', price: 19.99 },
          { label: 'Inspect Suspension Components', price: 19.99 },
        ],
      },
      {
        id: 'premium',
        name: 'Premium',
        valuedAt: 973,
        packageTotal: 855,
        items: [
          { label: 'Everything in Value, plus:', isNote: true },
          { label: 'GDI Service (FSC not needed if this is done)', price: 206 },
          { label: 'Brake Fluid Service', price: 167 },
          { label: 'Alignment', price: 124.95 },
        ],
      },
    ],
  },
  {
    id: '45k',
    mileageLabel: '45,000 Mile',
    shortLabel: '45K',
    bonus: 'Multi-Point Inspection & Car Wash',
    tiers: [
      {
        id: 'minimum',
        name: 'Minimum',
        valuedAt: 270,
        packageTotal: 170,
        items: [
          { label: 'Oil Change', price: 99 },
          { label: 'Tire Rotation', price: 34.95 },
          { label: 'Fuel System Cleaner', price: 38 },
          { label: 'Brake & Battery Inspection', price: 99.5 },
          { label: 'Check and Top Off Fluids', price: 0 },
          { label: 'GDS Scan for DTCs', price: 0 },
        ],
      },
      {
        id: 'value',
        name: 'Value',
        valuedAt: 405,
        packageTotal: 275,
        items: [
          { label: 'Everything in Minimum, plus:', isNote: true },
          { label: 'Cabin Air Filter', price: 70 },
          { label: 'In-Cabin Deodorizer', price: 25 },
          { label: 'Inspect Drive Belts', price: 19.99 },
          { label: 'Inspect Fuel Tank/Lines', price: 19.99 },
        ],
      },
      {
        id: 'premium',
        name: 'Premium',
        valuedAt: 715,
        packageTotal: 599,
        items: [
          { label: 'Everything in Value, plus:', isNote: true },
          { label: 'GDI Service (FSC not needed if this is done)', price: 206 },
          { label: 'Balance All 4 Tires', price: 80 },
          { label: 'Battery Cleaning Service', price: 25 },
        ],
      },
    ],
  },
];

export const DEALER_MENU_BRANDING = {
  dealerName: 'Hyundai of Santa Maria',
  tagline: 'Service Specials — Essential Bundle Packages',
};
