/**
 * NIP-47 NWC Protocol Types
 */

export interface NwcRequest {
  method: string;
  params?: Record<string, unknown>;
}

export interface NwcResponse {
  result_type: string;
  error?: {
    code: string;
    message: string;
  };
  result?: Record<string, unknown>;
}

export interface NwcGetInfoResult {
  alias?: string;
  color?: string;
  pubkey?: string;
  network?: string;
  block_height?: number;
  block_hash?: string;
  methods?: string[];
}

export interface NwcGetBalanceResult {
  balance: number; // Balance in millisatoshis
}

export interface NwcPayInvoiceParams {
  invoice: string;
  amount?: number; // Optional amount in millisatoshis (for zero-amount invoices)
}

export interface NwcPayInvoiceResult {
  preimage: string;
}

export interface NwcMakeInvoiceParams {
  amount: number; // Amount in millisatoshis
  description?: string;
  description_hash?: string;
  expiry?: number; // Expiry in seconds
}

export interface NwcMakeInvoiceResult {
  type: 'incoming';
  invoice: string;
  description?: string;
  description_hash?: string;
  preimage?: string;
  payment_hash: string;
  amount: number;
  fees_paid?: number;
  created_at: number;
  expires_at: number;
  settled_at?: number;
  metadata?: Record<string, unknown>;
}

export interface NwcLookupInvoiceParams {
  payment_hash?: string;
  invoice?: string;
}

export interface NwcLookupInvoiceResult {
  type: 'incoming' | 'outgoing';
  invoice?: string;
  description?: string;
  description_hash?: string;
  preimage?: string;
  payment_hash: string;
  amount: number;
  fees_paid?: number;
  created_at: number;
  expires_at?: number;
  settled_at?: number;
  metadata?: Record<string, unknown>;
}

export interface NwcListTransactionsParams {
  from?: number;
  until?: number;
  limit?: number;
  offset?: number;
  unpaid?: boolean;
  type?: 'incoming' | 'outgoing';
}

export interface NwcListTransactionsResult {
  transactions: NwcLookupInvoiceResult[];
}

/**
 * NWC Error Codes
 */
export const NWC_ERROR_CODES = {
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RESTRICTED: 'RESTRICTED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL: 'INTERNAL',
  OTHER: 'OTHER',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type NwcErrorCode = (typeof NWC_ERROR_CODES)[keyof typeof NWC_ERROR_CODES];

/**
 * NWC Method names (from NIP-47)
 */
export const NWC_METHODS = {
  GET_INFO: 'get_info',
  GET_BALANCE: 'get_balance',
  PAY_INVOICE: 'pay_invoice',
  MAKE_INVOICE: 'make_invoice',
  LOOKUP_INVOICE: 'lookup_invoice',
  LIST_TRANSACTIONS: 'list_transactions',
  PAY_KEYSEND: 'pay_keysend',
  MULTI_PAY_INVOICE: 'multi_pay_invoice',
  MULTI_PAY_KEYSEND: 'multi_pay_keysend',
} as const;

export type NwcMethod = (typeof NWC_METHODS)[keyof typeof NWC_METHODS];
