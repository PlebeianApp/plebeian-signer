import { Injectable } from '@angular/core';
import {
  Mint,
  Wallet,
  getDecodedToken,
  getEncodedTokenV4,
  Token,
  Proof,
  CheckStateEnum,
} from '@cashu/cashu-ts';
import { StorageService, CashuMint_DECRYPTED, CashuProof } from '@common';
import {
  CashuReceiveResult,
  CashuSendResult,
  DecodedCashuToken,
  CashuMintInfo,
  CashuMintQuote,
  CashuMintResult,
  MintQuoteState,
} from './types';

interface CachedWallet {
  wallet: Wallet;
  mint: Mint;
  mintId: string;
}

/**
 * Angular service for managing Cashu ecash wallets
 */
@Injectable({
  providedIn: 'root',
})
export class CashuService {
  private wallets = new Map<string, CachedWallet>();

  constructor(private storageService: StorageService) {}

  /**
   * Get all Cashu mints from storage
   */
  getMints(): CashuMint_DECRYPTED[] {
    const sessionData =
      this.storageService.getBrowserSessionHandler().browserSessionData;
    return sessionData?.cashuMints ?? [];
  }

  /**
   * Get a single Cashu mint by ID
   */
  getMint(mintId: string): CashuMint_DECRYPTED | undefined {
    return this.getMints().find((m) => m.id === mintId);
  }

  /**
   * Get a mint by URL
   */
  getMintByUrl(mintUrl: string): CashuMint_DECRYPTED | undefined {
    const normalizedUrl = mintUrl.replace(/\/$/, '');
    return this.getMints().find((m) => m.mintUrl === normalizedUrl);
  }

  /**
   * Add a new Cashu mint connection
   */
  async addMint(name: string, mintUrl: string): Promise<CashuMint_DECRYPTED> {
    // Test the mint connection first
    await this.testMintConnection(mintUrl);

    // Add to storage
    return await this.storageService.addCashuMint({
      name,
      mintUrl,
      unit: 'sat',
    });
  }

  /**
   * Delete a Cashu mint connection
   */
  async deleteMint(mintId: string): Promise<void> {
    // Remove from cache
    this.wallets.delete(mintId);
    await this.storageService.deleteCashuMint(mintId);
  }

  /**
   * Get or create a wallet for a mint
   */
  private async getWallet(mintId: string): Promise<CachedWallet> {
    // Check cache
    const cached = this.wallets.get(mintId);
    if (cached) {
      return cached;
    }

    // Get mint data from storage
    const mintData = this.getMint(mintId);
    if (!mintData) {
      throw new Error('Mint not found');
    }

    // Create mint and wallet instances
    const mint = new Mint(mintData.mintUrl);
    const wallet = new Wallet(mint, { unit: mintData.unit || 'sat' });

    // Load mint keys
    await wallet.loadMint();

    // Cache it
    const cachedWallet: CachedWallet = {
      wallet,
      mint,
      mintId,
    };
    this.wallets.set(mintId, cachedWallet);

    return cachedWallet;
  }

  /**
   * Test a mint connection by fetching its info
   */
  async testMintConnection(mintUrl: string): Promise<CashuMintInfo> {
    const normalizedUrl = mintUrl.replace(/\/$/, '');
    const mint = new Mint(normalizedUrl);
    const info = await mint.getInfo();
    return {
      name: info.name,
      description: info.description,
      version: info.version,
      contact: info.contact?.map((c) => ({ method: c.method, info: c.info })),
      nuts: info.nuts,
    };
  }

  /**
   * Decode a Cashu token without claiming it
   */
  decodeToken(token: string): DecodedCashuToken | null {
    try {
      const decoded = getDecodedToken(token);
      const proofs = decoded.proofs;
      const amount = proofs.reduce((sum, p) => sum + p.amount, 0);

      return {
        mint: decoded.mint,
        unit: decoded.unit || 'sat',
        amount,
        proofs,
      };
    } catch {
      return null;
    }
  }

  /**
   * Receive a Cashu token
   * This validates and claims the proofs, then stores them
   */
  async receive(token: string): Promise<CashuReceiveResult> {
    // Decode the token
    const decoded = this.decodeToken(token);
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // Check if we have this mint
    let mintData = this.getMintByUrl(decoded.mint);

    // If we don't have this mint, add it automatically
    if (!mintData) {
      // Use the mint URL as the name initially
      const urlObj = new URL(decoded.mint);
      mintData = await this.storageService.addCashuMint({
        name: urlObj.hostname,
        mintUrl: decoded.mint,
        unit: decoded.unit || 'sat',
      });
    }

    // Get the wallet for this mint
    const { wallet } = await this.getWallet(mintData.id);

    // Receive the token (this swaps proofs with the mint)
    const receivedProofs = await wallet.receive(token);

    // Convert to our proof format with timestamp
    const now = new Date().toISOString();
    const newProofs: CashuProof[] = receivedProofs.map((p: Proof) => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
      receivedAt: now,
    }));

    // Merge with existing proofs
    const existingProofs = mintData!.proofs || [];
    const allProofs = [...existingProofs, ...newProofs];

    // Update storage
    await this.storageService.updateCashuMintProofs(mintData!.id, allProofs);

    // Calculate received amount
    const amount = newProofs.reduce((sum, p) => sum + p.amount, 0);

    return {
      amount,
      mintUrl: decoded.mint,
      mintId: mintData!.id,
    };
  }

  /**
   * Send Cashu tokens
   * Creates an encoded token from existing proofs
   */
  async send(mintId: string, amount: number): Promise<CashuSendResult> {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      throw new Error('Mint not found');
    }

    // Check we have enough balance
    const balance = this.getBalance(mintId);
    if (balance < amount) {
      throw new Error(`Insufficient balance. Have ${balance} sats, need ${amount} sats`);
    }

    // Get the wallet
    const { wallet } = await this.getWallet(mintId);

    // Convert our proofs to the format cashu-ts expects
    const proofs: Proof[] = mintData.proofs.map((p) => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
    }));

    // Send - this returns send proofs and keep proofs (change)
    const { send, keep } = await wallet.send(amount, proofs);

    // Create the token to share
    const token: Token = {
      mint: mintData.mintUrl,
      proofs: send,
      unit: mintData.unit || 'sat',
    };
    const encodedToken = getEncodedTokenV4(token);

    // Update our stored proofs to only keep the change (new proofs from mint)
    const now = new Date().toISOString();
    const keepProofs: CashuProof[] = keep.map((p: Proof) => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
      receivedAt: now,
    }));

    await this.storageService.updateCashuMintProofs(mintId, keepProofs);

    return {
      token: encodedToken,
      amount,
    };
  }

  /**
   * Check if any proofs have been spent
   * Removes spent proofs from storage
   */
  async checkProofsSpent(mintId: string): Promise<number> {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      throw new Error('Mint not found');
    }

    if (mintData.proofs.length === 0) {
      return 0;
    }

    const { wallet } = await this.getWallet(mintId);

    // Only the secret field is needed for checking proof states
    const proofsToCheck = mintData.proofs.map((p) => ({ secret: p.secret }));

    // Check which proofs are spent using v3 API
    const proofStates = await wallet.checkProofsStates(proofsToCheck);

    // Filter out spent proofs
    const unspentProofs: CashuProof[] = [];
    let removedAmount = 0;

    for (let i = 0; i < mintData.proofs.length; i++) {
      if (proofStates[i].state !== CheckStateEnum.SPENT) {
        unspentProofs.push(mintData.proofs[i]);
      } else {
        removedAmount += mintData.proofs[i].amount;
      }
    }

    // Update storage if any were spent
    if (removedAmount > 0) {
      await this.storageService.updateCashuMintProofs(mintId, unspentProofs);
    }

    return removedAmount;
  }

  /**
   * Create a mint quote (Lightning invoice) for depositing sats
   * Returns a Lightning invoice that when paid will allow minting tokens
   */
  async createMintQuote(mintId: string, amount: number): Promise<CashuMintQuote> {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      throw new Error('Mint not found');
    }

    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const { wallet } = await this.getWallet(mintId);

    // Create a mint quote - this returns a Lightning invoice
    const quote = await wallet.createMintQuote(amount);

    return {
      quoteId: quote.quote,
      invoice: quote.request,
      amount: amount,
      state: quote.state as MintQuoteState,
      expiry: quote.expiry,
    };
  }

  /**
   * Check the status of a mint quote
   * Returns the current state (UNPAID, PAID, ISSUED)
   */
  async checkMintQuote(mintId: string, quoteId: string): Promise<CashuMintQuote> {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      throw new Error('Mint not found');
    }

    const { wallet } = await this.getWallet(mintId);

    // Check the quote status
    const quote = await wallet.checkMintQuote(quoteId);

    return {
      quoteId: quote.quote,
      invoice: quote.request,
      amount: 0, // Amount not returned in check response
      state: quote.state as MintQuoteState,
      expiry: quote.expiry,
    };
  }

  /**
   * Mint tokens after paying the Lightning invoice
   * This claims the tokens and stores them
   */
  async mintTokens(mintId: string, amount: number, quoteId: string): Promise<CashuMintResult> {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      throw new Error('Mint not found');
    }

    const { wallet } = await this.getWallet(mintId);

    // Mint the proofs
    const mintedProofs = await wallet.mintProofs(amount, quoteId);

    // Convert to our proof format with timestamp
    const now = new Date().toISOString();
    const newProofs: CashuProof[] = mintedProofs.map((p: Proof) => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
      receivedAt: now,
    }));

    // Merge with existing proofs
    const existingProofs = mintData.proofs || [];
    const allProofs = [...existingProofs, ...newProofs];

    // Update storage
    await this.storageService.updateCashuMintProofs(mintId, allProofs);

    // Calculate minted amount
    const mintedAmount = newProofs.reduce((sum, p) => sum + p.amount, 0);

    return {
      amount: mintedAmount,
      mintId: mintId,
    };
  }

  /**
   * Get balance for a specific mint (in satoshis)
   */
  getBalance(mintId: string): number {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      return 0;
    }
    return mintData.proofs.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Get proofs for a specific mint
   */
  getProofs(mintId: string): CashuProof[] {
    const mintData = this.getMint(mintId);
    if (!mintData) {
      return [];
    }
    return mintData.proofs;
  }

  /**
   * Get total balance across all mints (in satoshis)
   */
  getTotalBalance(): number {
    const mints = this.getMints();
    return mints.reduce((sum, m) => sum + this.getBalance(m.id), 0);
  }

  /**
   * Get cached total balance (same as getTotalBalance for Cashu since it's all local)
   */
  getCachedTotalBalance(): number {
    return this.getTotalBalance();
  }

  /**
   * Format a balance for display (Cashu uses satoshis, not millisatoshis)
   */
  formatBalance(sats: number | undefined): string {
    if (sats === undefined) return '—';
    return sats.toLocaleString('en-US');
  }
}
