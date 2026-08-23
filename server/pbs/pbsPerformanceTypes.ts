/** PBS RepairOrder / PartsInvoice shapes used for advisor performance aggregation. */

export interface PbsMoneySummary {
  Labour?: number;
  Parts?: number;
  SubTotal?: number;
  GrandTotal?: number;
  InvoiceTotal?: number;
}

export interface PbsLabourLine {
  CSR?: string;
  OpCode?: string;
  OpDescription?: string;
  Tech?: string;
  SoldHours?: number;
  ActualHours?: number;
  Price?: number;
  Cost?: number;
}

export interface PbsPartLine {
  CSR?: string;
  PartNumber?: string;
  PartDescription?: string;
  ExtendedPrice?: number;
  UnitPrice?: number;
  Cost?: number;
  Shipped?: number;
  Requested?: number;
}

export interface PbsRepairOrderRequestFull {
  CSR?: string;
  RequestDescription?: string;
  Status?: string;
  Tech?: string;
  LabourLines?: PbsLabourLine[];
  PartLines?: PbsPartLine[];
  Summary?: PbsMoneySummary;
}

export interface PbsRepairOrderFull {
  RepairOrderId?: string;
  RepairOrderNumber?: number | string;
  RawRepairOrderNumber?: string;
  DateCashiered?: string;
  DateOpened?: string;
  CSR?: string;
  Status?: string;
  Requests?: PbsRepairOrderRequestFull[];
  CustomerSummary?: PbsMoneySummary;
  WarrantySummary?: PbsMoneySummary;
  InternalSummary?: PbsMoneySummary;
}

export interface PbsPartsInvoiceFull {
  InvoiceId?: string;
  InvoiceNumber?: number;
  RawPartsInvoiceNumber?: string;
  DateCashiered?: string;
  Status?: string;
  PartLines?: PbsPartLine[];
  Summary?: {
    Sales?: number;
    TotalInvoice?: number;
  };
}

export interface PbsAdvisorPerformanceRow {
  name: string;
  soCount: number;
  hrsSold: number;
  laborSold: number;
  grossLabor: number;
  partsSold: number;
  grossParts: number;
  totalSales: number;
  gpPercent: number;
  elr: number;
  upsells: Array<{ code: string; description: string; count: number; revenue: number }>;
}

export interface PbsPerformanceTotals {
  totalSales: number;
  totalLabor: number;
  totalGross: number;
  totalParts: number;
  totalGrossParts: number;
  totalHrs: number;
}

export interface PbsPerformanceAggregate {
  advisors: PbsAdvisorPerformanceRow[];
  totals: PbsPerformanceTotals;
  reportStartDate: string;
  reportEndDate: string;
  repairOrdersProcessed: number;
  partsInvoicesProcessed: number;
}
