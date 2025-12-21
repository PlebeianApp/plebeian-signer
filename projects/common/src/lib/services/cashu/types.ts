import type { Proof } from '@cashu/cashu-ts';

/**
 * Result from receiving a Cashu token
 */
export interface CashuReceiveResult {
  amount: number;      // Amount received in satoshis
  mintUrl: string;     // Mint the tokens were from
  mintId: string;      // ID of the mint in our storage
}

/**
 * Result from sending Cashu tokens
 */
export interface CashuSendResult {
  token: string;       // Encoded token to share (cashuB...)
  amount: number;      // Amount in satoshis
}

/**
 * Information about a decoded Cashu token
 */
export interface DecodedCashuToken {
  mint: string;        // Mint URL
  unit: string;        // Unit (usually 'sat')
  amount: number;      // Total amount in the token
  proofs: Proof[];     // The individual proofs
}

/**
 * Mint contact info
 */
export interface MintContact {
  method: string;
  info: string;
}

/**
 * Mint information returned when testing a connection
 */
export interface CashuMintInfo {
  name?: string;
  description?: string;
  version?: string;
  contact?: MintContact[];
  nuts: Record<string, unknown>;
}

/**
 * State of a mint quote
 */
export type MintQuoteState = 'UNPAID' | 'PAID' | 'ISSUED';

/**
 * Result from creating a mint quote (Lightning invoice to deposit)
 */
export interface CashuMintQuote {
  quoteId: string;        // Quote ID for checking status and claiming
  invoice: string;        // Lightning invoice to pay
  amount: number;         // Amount in satoshis
  state: MintQuoteState;  // Current state of the quote
  expiry?: number;        // Expiry timestamp (unix seconds)
}

/**
 * Result from minting tokens after paying the invoice
 */
export interface CashuMintResult {
  amount: number;         // Amount minted in satoshis
  mintId: string;         // ID of the mint
}
