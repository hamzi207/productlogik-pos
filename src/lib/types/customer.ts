import type { Tables } from "./database.types";

/** A customer row with quote activity, as the directory table shows it. */
export type CustomerListItem = Tables<"customers"> & {
  /** Quotes and invoices, excluding cancelled ones. */
  quoteCount: number;
  /** Sum of invoices that are issued but not yet paid. */
  outstanding: number;
  /** RF-19.2: ids of the customer's tags. */
  tagIds: string[];
};

export type CustomerQuote = {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  amount_paid: number;
  due_date: string | null;
  /** Walk-in sales: who the cash customer was. */
  walk_in_name: string | null;
};

export type CustomerDetail = Tables<"customers"> & {
  quotes: CustomerQuote[];
  outstanding: number;
  tagIds: string[];
};
