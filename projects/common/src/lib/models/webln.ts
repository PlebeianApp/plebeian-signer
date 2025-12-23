/**
 * WebLN API Types
 * Based on the WebLN specification: https://webln.dev/
 */

export interface WebLNNode {
  alias?: string;
  pubkey?: string;
  color?: string;
}

export interface GetInfoResponse {
  node: WebLNNode;
}

export interface SendPaymentResponse {
  preimage: string;
}

export interface RequestInvoiceArgs {
  amount?: string | number;
  defaultAmount?: string | number;
  minimumAmount?: string | number;
  maximumAmount?: string | number;
  defaultMemo?: string;
}

export interface RequestInvoiceResponse {
  paymentRequest: string;
}

export interface KeysendArgs {
  destination: string;
  amount: string | number;
  customRecords?: Record<string, string>;
}

export interface SignMessageResponse {
  message: string;
  signature: string;
}
