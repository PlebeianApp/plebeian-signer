import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  LoggerService,
  NavComponent,
  NwcService,
  NwcConnection_DECRYPTED,
  CashuService,
  CashuMint_DECRYPTED,
  CashuProof,
  NwcLookupInvoiceResult,
  BrowserSyncFlow,
} from '@common';
import * as QRCode from 'qrcode';

type WalletSection =
  | 'main'
  | 'cashu'
  | 'cashu-detail'
  | 'cashu-add'
  | 'cashu-receive'
  | 'cashu-send'
  | 'cashu-mint'
  | 'lightning'
  | 'lightning-detail'
  | 'lightning-add'
  | 'lightning-receive'
  | 'lightning-pay';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.component.html',
  styleUrl: './wallet.component.scss',
  imports: [CommonModule, FormsModule],
})
export class WalletComponent extends NavComponent implements OnInit, OnDestroy {
  readonly #logger = inject(LoggerService);
  readonly #router = inject(Router);
  readonly nwcService = inject(NwcService);
  readonly cashuService = inject(CashuService);

  activeSection: WalletSection = 'main';
  selectedConnectionId: string | null = null;
  selectedMintId: string | null = null;

  // Form fields for adding new NWC connection
  newWalletName = '';
  newWalletUrl = '';
  addingConnection = false;
  testingConnection = false;
  connectionError = '';
  connectionTestResult = '';

  // Form fields for adding new Cashu mint
  newMintName = '';
  newMintUrl = '';
  addingMint = false;
  testingMint = false;
  mintError = '';
  mintTestResult = '';

  // Cashu receive/send fields
  receiveToken = '';
  receivingToken = false;
  receiveError = '';
  receiveResult = '';
  sendAmount = 0;
  sendingToken = false;
  sendError = '';
  sendResult = '';

  // Cashu mint (deposit) fields
  depositAmount = 0;
  creatingDepositQuote = false;
  depositQuoteId = '';
  depositInvoice = '';
  depositInvoiceQr = '';
  depositError = '';
  depositSuccess = '';
  checkingDepositPayment = false;
  depositQuoteState: 'UNPAID' | 'PAID' | 'ISSUED' = 'UNPAID';
  private depositPollingInterval: ReturnType<typeof setInterval> | null = null;

  // Loading states
  loadingBalances = false;
  balanceError = '';

  // Lightning transaction history
  transactions: NwcLookupInvoiceResult[] = [];
  loadingTransactions = false;
  transactionsError = '';
  transactionsNotSupported = false;

  // Lightning receive
  lnReceiveAmount = 0;
  lnReceiveDescription = '';
  generatingInvoice = false;
  generatedInvoice = '';
  generatedInvoiceQr = '';
  lnReceiveError = '';
  invoiceCopied = false;

  // Lightning pay
  showPayModal = false;
  payInput = '';
  payAmount = 0;
  paying = false;
  paymentSuccess = false;
  paymentError = '';

  // Clipboard feedback
  addressCopied = false;

  // Cashu onboarding info
  showCashuInfo = true;
  currentSyncFlow: BrowserSyncFlow = BrowserSyncFlow.NO_SYNC;
  readonly BrowserSyncFlow = BrowserSyncFlow; // Expose enum to template
  readonly browserDownloadSettingsUrl = 'chrome://settings/downloads';

  // Cashu mint refresh
  refreshingMint = false;
  refreshError = '';

  get title(): string {
    switch (this.activeSection) {
      case 'cashu':
        return 'Cashu';
      case 'cashu-detail':
        return this.selectedMint?.name ?? 'Mint';
      case 'cashu-add':
        return 'Add Mint';
      case 'cashu-receive':
        return 'Receive';
      case 'cashu-send':
        return 'Send';
      case 'cashu-mint':
        return 'Deposit';
      case 'lightning':
        return 'Lightning';
      case 'lightning-detail':
        return this.selectedConnection?.name ?? 'Wallet';
      case 'lightning-add':
        return 'Add Wallet';
      case 'lightning-receive':
        return 'Receive';
      case 'lightning-pay':
        return 'Pay';
      default:
        return 'Wallet';
    }
  }

  get showBackButton(): boolean {
    return this.activeSection !== 'main';
  }

  get connections(): NwcConnection_DECRYPTED[] {
    return this.nwcService.getConnections();
  }

  get selectedConnection(): NwcConnection_DECRYPTED | undefined {
    if (!this.selectedConnectionId) return undefined;
    return this.nwcService.getConnection(this.selectedConnectionId);
  }

  get totalLightningBalance(): number {
    return this.nwcService.getCachedTotalBalance();
  }

  get mints(): CashuMint_DECRYPTED[] {
    return this.cashuService.getMints();
  }

  get selectedMint(): CashuMint_DECRYPTED | undefined {
    if (!this.selectedMintId) return undefined;
    return this.cashuService.getMint(this.selectedMintId);
  }

  get totalCashuBalance(): number {
    return this.cashuService.getCachedTotalBalance();
  }

  get selectedMintBalance(): number {
    if (!this.selectedMintId) return 0;
    return this.cashuService.getBalance(this.selectedMintId);
  }

  get selectedMintProofs(): CashuProof[] {
    if (!this.selectedMintId) return [];
    return this.cashuService.getProofs(this.selectedMintId);
  }

  ngOnInit(): void {
    // Load current sync flow setting
    this.currentSyncFlow = this.storage.getSyncFlow();

    // Refresh balances on init if we have connections
    if (this.connections.length > 0) {
      this.refreshAllBalances();
    }
  }

  ngOnDestroy(): void {
    this.nwcService.disconnectAll();
    this.stopDepositPolling();
  }

  setSection(section: WalletSection) {
    this.activeSection = section;
    this.connectionError = '';
    this.connectionTestResult = '';
  }

  goBack() {
    switch (this.activeSection) {
      case 'lightning-detail':
      case 'lightning-add':
        this.activeSection = 'lightning';
        this.selectedConnectionId = null;
        this.resetAddForm();
        this.resetLightningForms();
        break;
      case 'lightning-receive':
      case 'lightning-pay':
        this.activeSection = 'lightning-detail';
        this.resetLightningForms();
        break;
      case 'cashu-detail':
      case 'cashu-add':
        this.activeSection = 'cashu';
        this.selectedMintId = null;
        this.resetAddMintForm();
        break;
      case 'cashu-receive':
      case 'cashu-send':
      case 'cashu-mint':
        this.activeSection = 'cashu-detail';
        this.resetReceiveSendForm();
        this.resetDepositForm();
        break;
      case 'lightning':
      case 'cashu':
        this.activeSection = 'main';
        break;
    }
  }

  selectConnection(connectionId: string) {
    this.selectedConnectionId = connectionId;
    this.activeSection = 'lightning-detail';
    this.loadTransactions(connectionId);
  }

  private resetLightningForms() {
    this.lnReceiveAmount = 0;
    this.lnReceiveDescription = '';
    this.generatingInvoice = false;
    this.generatedInvoice = '';
    this.generatedInvoiceQr = '';
    this.lnReceiveError = '';
    this.invoiceCopied = false;
    this.payInput = '';
    this.payAmount = 0;
    this.paying = false;
    this.paymentSuccess = false;
    this.paymentError = '';
    this.showPayModal = false;
  }

  showAddConnection() {
    this.resetAddForm();
    this.activeSection = 'lightning-add';
  }

  private resetAddForm() {
    this.newWalletName = '';
    this.newWalletUrl = '';
    this.connectionError = '';
    this.connectionTestResult = '';
    this.addingConnection = false;
    this.testingConnection = false;
  }

  async testConnection() {
    if (!this.newWalletUrl.trim()) {
      this.connectionError = 'Please enter an NWC URL';
      return;
    }

    this.testingConnection = true;
    this.connectionError = '';
    this.connectionTestResult = '';
    this.nwcService.clearLogs();

    try {
      const info = await this.nwcService.testConnection(this.newWalletUrl);
      this.connectionTestResult = `Connected! ${info.alias ? 'Wallet: ' + info.alias : ''}`;
      // Hide logs on success
      this.nwcService.clearLogs();
    } catch (error) {
      this.connectionError =
        error instanceof Error ? error.message : 'Connection test failed';
      // Keep logs visible on failure for debugging
    } finally {
      this.testingConnection = false;
    }
  }

  async addConnection() {
    if (!this.newWalletName.trim()) {
      this.connectionError = 'Please enter a wallet name';
      return;
    }
    if (!this.newWalletUrl.trim()) {
      this.connectionError = 'Please enter an NWC URL';
      return;
    }

    this.addingConnection = true;
    this.connectionError = '';

    try {
      await this.nwcService.addConnection(
        this.newWalletName.trim(),
        this.newWalletUrl.trim()
      );

      // Refresh the balance for the new connection
      const connections = this.nwcService.getConnections();
      const newConnection = connections[connections.length - 1];
      if (newConnection) {
        try {
          await this.nwcService.getBalance(newConnection.id);
        } catch {
          // Ignore balance fetch error
        }
      }

      this.goBack();
    } catch (error) {
      this.connectionError =
        error instanceof Error ? error.message : 'Failed to add connection';
    } finally {
      this.addingConnection = false;
    }
  }

  async deleteConnection() {
    if (!this.selectedConnectionId) return;

    const connection = this.selectedConnection;
    if (
      !confirm(`Delete wallet "${connection?.name}"? This cannot be undone.`)
    ) {
      return;
    }

    try {
      await this.nwcService.deleteConnection(this.selectedConnectionId);
      this.goBack();
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  }

  // Cashu methods

  selectMint(mintId: string) {
    this.selectedMintId = mintId;
    this.activeSection = 'cashu-detail';
    // Auto-refresh to check for spent proofs
    this.refreshMint();
  }

  async refreshMint() {
    if (!this.selectedMintId || this.refreshingMint) return;

    this.refreshingMint = true;
    this.refreshError = '';

    try {
      const removedAmount = await this.cashuService.checkProofsSpent(this.selectedMintId);
      if (removedAmount > 0) {
        // Balance was updated, proofs were spent
        console.log(`Removed ${removedAmount} sats of spent proofs`);
      }
    } catch (error) {
      this.refreshError = error instanceof Error ? error.message : 'Failed to refresh';
      console.error('Failed to refresh mint:', error);
    } finally {
      this.refreshingMint = false;
    }
  }

  showAddMint() {
    this.resetAddMintForm();
    this.activeSection = 'cashu-add';
  }

  showReceive() {
    this.resetReceiveSendForm();
    this.activeSection = 'cashu-receive';
  }

  showSend() {
    this.resetReceiveSendForm();
    this.activeSection = 'cashu-send';
  }

  private resetAddMintForm() {
    this.newMintName = '';
    this.newMintUrl = '';
    this.mintError = '';
    this.mintTestResult = '';
    this.addingMint = false;
    this.testingMint = false;
  }

  private resetReceiveSendForm() {
    this.receiveToken = '';
    this.receivingToken = false;
    this.receiveError = '';
    this.receiveResult = '';
    this.sendAmount = 0;
    this.sendingToken = false;
    this.sendError = '';
    this.sendResult = '';
  }

  private resetDepositForm() {
    this.depositAmount = 0;
    this.creatingDepositQuote = false;
    this.depositQuoteId = '';
    this.depositInvoice = '';
    this.depositInvoiceQr = '';
    this.depositError = '';
    this.depositSuccess = '';
    this.checkingDepositPayment = false;
    this.depositQuoteState = 'UNPAID';
    this.stopDepositPolling();
  }

  private stopDepositPolling() {
    if (this.depositPollingInterval) {
      clearInterval(this.depositPollingInterval);
      this.depositPollingInterval = null;
    }
  }

  async testMint() {
    if (!this.newMintUrl.trim()) {
      this.mintError = 'Please enter a mint URL';
      return;
    }

    this.testingMint = true;
    this.mintError = '';
    this.mintTestResult = '';

    try {
      const info = await this.cashuService.testMintConnection(
        this.newMintUrl.trim()
      );
      this.mintTestResult = `Connected! ${info.name ? 'Mint: ' + info.name : ''}`;
    } catch (error) {
      this.mintError =
        error instanceof Error ? error.message : 'Connection test failed';
    } finally {
      this.testingMint = false;
    }
  }

  async addMint() {
    if (!this.newMintName.trim()) {
      this.mintError = 'Please enter a mint name';
      return;
    }
    if (!this.newMintUrl.trim()) {
      this.mintError = 'Please enter a mint URL';
      return;
    }

    this.addingMint = true;
    this.mintError = '';

    try {
      await this.cashuService.addMint(
        this.newMintName.trim(),
        this.newMintUrl.trim()
      );
      this.goBack();
    } catch (error) {
      this.mintError =
        error instanceof Error ? error.message : 'Failed to add mint';
    } finally {
      this.addingMint = false;
    }
  }

  async deleteMint() {
    if (!this.selectedMintId) return;

    const mint = this.selectedMint;
    if (!confirm(`Delete mint "${mint?.name}"? Any tokens stored will be lost. This cannot be undone.`)) {
      return;
    }

    try {
      await this.cashuService.deleteMint(this.selectedMintId);
      this.goBack();
    } catch (error) {
      console.error('Failed to delete mint:', error);
    }
  }

  async receiveTokens() {
    if (!this.receiveToken.trim()) {
      this.receiveError = 'Please paste a Cashu token';
      return;
    }

    this.receivingToken = true;
    this.receiveError = '';
    this.receiveResult = '';

    try {
      const result = await this.cashuService.receive(this.receiveToken.trim());
      this.receiveResult = `Received ${result.amount} sats!`;
      this.receiveToken = '';
    } catch (error) {
      this.receiveError =
        error instanceof Error ? error.message : 'Failed to receive token';
    } finally {
      this.receivingToken = false;
    }
  }

  async sendTokens() {
    if (!this.selectedMintId) return;

    if (this.sendAmount <= 0) {
      this.sendError = 'Please enter a valid amount';
      return;
    }

    const balance = this.selectedMintBalance;
    if (this.sendAmount > balance) {
      this.sendError = `Insufficient balance. You have ${balance} sats`;
      return;
    }

    this.sendingToken = true;
    this.sendError = '';
    this.sendResult = '';

    try {
      const result = await this.cashuService.send(
        this.selectedMintId,
        this.sendAmount
      );
      this.sendResult = result.token;
      this.sendAmount = 0;
    } catch (error) {
      this.sendError =
        error instanceof Error ? error.message : 'Failed to create token';
    } finally {
      this.sendingToken = false;
    }
  }

  copyToken() {
    if (this.sendResult) {
      navigator.clipboard.writeText(this.sendResult);
    }
  }

  async checkProofs() {
    if (!this.selectedMintId) return;

    try {
      const removedAmount = await this.cashuService.checkProofsSpent(
        this.selectedMintId
      );
      if (removedAmount > 0) {
        alert(`Removed ${removedAmount} sats of spent proofs.`);
      } else {
        alert('All proofs are valid.');
      }
    } catch (error) {
      console.error('Failed to check proofs:', error);
    }
  }

  // Cashu deposit (mint) methods

  showDeposit() {
    this.resetDepositForm();
    this.activeSection = 'cashu-mint';
  }

  async createDepositInvoice() {
    if (!this.selectedMintId) return;

    if (this.depositAmount <= 0) {
      this.depositError = 'Please enter an amount';
      return;
    }

    this.creatingDepositQuote = true;
    this.depositError = '';
    this.depositInvoice = '';
    this.depositInvoiceQr = '';

    try {
      const quote = await this.cashuService.createMintQuote(
        this.selectedMintId,
        this.depositAmount
      );

      this.depositQuoteId = quote.quoteId;
      this.depositInvoice = quote.invoice;
      this.depositQuoteState = quote.state;

      // Generate QR code
      this.depositInvoiceQr = await QRCode.toDataURL(quote.invoice, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      // Start polling for payment
      this.startDepositPolling();
    } catch (error) {
      this.depositError =
        error instanceof Error ? error.message : 'Failed to create invoice';
    } finally {
      this.creatingDepositQuote = false;
    }
  }

  private startDepositPolling() {
    // Poll every 3 seconds for payment confirmation
    this.depositPollingInterval = setInterval(async () => {
      await this.checkDepositPayment();
    }, 3000);
  }

  async checkDepositPayment() {
    if (!this.selectedMintId || !this.depositQuoteId) return;

    this.checkingDepositPayment = true;

    try {
      const quote = await this.cashuService.checkMintQuote(
        this.selectedMintId,
        this.depositQuoteId
      );

      this.depositQuoteState = quote.state;

      if (quote.state === 'PAID') {
        // Invoice is paid, claim the tokens
        this.stopDepositPolling();
        await this.claimDepositTokens();
      } else if (quote.state === 'ISSUED') {
        // Already claimed
        this.stopDepositPolling();
        this.depositSuccess = 'Tokens already claimed!';
      }
    } catch (error) {
      // Don't show error for polling failures, just log
      console.error('Failed to check payment:', error);
    } finally {
      this.checkingDepositPayment = false;
    }
  }

  async claimDepositTokens() {
    if (!this.selectedMintId || !this.depositQuoteId) return;

    try {
      const result = await this.cashuService.mintTokens(
        this.selectedMintId,
        this.depositAmount,
        this.depositQuoteId
      );

      this.depositSuccess = `Received ${result.amount} sats!`;
      this.depositQuoteState = 'ISSUED';
    } catch (error) {
      this.depositError =
        error instanceof Error ? error.message : 'Failed to claim tokens';
    }
  }

  async copyDepositInvoice() {
    if (this.depositInvoice) {
      await navigator.clipboard.writeText(this.depositInvoice);
    }
  }

  formatCashuBalance(sats: number | undefined): string {
    return this.cashuService.formatBalance(sats);
  }

  async refreshBalance(connectionId: string) {
    try {
      await this.nwcService.getBalance(connectionId);
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  }

  async refreshAllBalances() {
    this.loadingBalances = true;
    this.balanceError = '';

    try {
      await this.nwcService.getAllBalances();
    } catch {
      this.balanceError = 'Failed to refresh some balances';
    } finally {
      this.loadingBalances = false;
    }
  }

  formatBalance(millisats: number | undefined): string {
    if (millisats === undefined) return '—';
    // Convert millisats to sats with 3 decimal places
    const sats = millisats / 1000;
    return sats.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }

  // Lightning transaction methods

  async loadTransactions(connectionId: string) {
    this.loadingTransactions = true;
    this.transactionsError = '';
    this.transactionsNotSupported = false;

    try {
      this.transactions = await this.nwcService.listTransactions(connectionId, {
        limit: 20,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('NOT_IMPLEMENTED') || errorMsg.includes('not supported')) {
        this.transactionsNotSupported = true;
      } else {
        this.transactionsError = errorMsg;
      }
      this.transactions = [];
    } finally {
      this.loadingTransactions = false;
    }
  }

  async refreshWallet() {
    if (!this.selectedConnectionId) return;

    // Refresh balance and transactions in parallel
    await Promise.all([
      this.refreshBalance(this.selectedConnectionId),
      this.loadTransactions(this.selectedConnectionId),
    ]);
  }

  showLnReceive() {
    this.resetLightningForms();
    this.activeSection = 'lightning-receive';
  }

  showLnPay() {
    this.resetLightningForms();
    this.showPayModal = true;
  }

  closePayModal() {
    this.showPayModal = false;
    this.resetLightningForms();
  }

  async createReceiveInvoice() {
    if (!this.selectedConnectionId) return;

    if (this.lnReceiveAmount <= 0) {
      this.lnReceiveError = 'Please enter an amount';
      return;
    }

    this.generatingInvoice = true;
    this.lnReceiveError = '';
    this.generatedInvoice = '';
    this.generatedInvoiceQr = '';

    try {
      const result = await this.nwcService.makeInvoice(
        this.selectedConnectionId,
        this.lnReceiveAmount * 1000, // Convert sats to millisats
        this.lnReceiveDescription || undefined
      );
      this.generatedInvoice = result.invoice;

      // Generate QR code
      this.generatedInvoiceQr = await QRCode.toDataURL(result.invoice, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch (error) {
      this.lnReceiveError =
        error instanceof Error ? error.message : 'Failed to create invoice';
    } finally {
      this.generatingInvoice = false;
    }
  }

  async copyInvoice() {
    if (this.generatedInvoice) {
      await navigator.clipboard.writeText(this.generatedInvoice);
      this.invoiceCopied = true;
      setTimeout(() => (this.invoiceCopied = false), 2000);
    }
  }

  async copyLightningAddress() {
    const lud16 = this.selectedConnection?.lud16;
    if (lud16) {
      await navigator.clipboard.writeText(lud16);
      this.addressCopied = true;
      setTimeout(() => (this.addressCopied = false), 2000);
    }
  }

  async payInvoiceOrAddress() {
    if (!this.selectedConnectionId || !this.payInput.trim()) {
      this.paymentError = 'Please enter a lightning address or invoice';
      return;
    }

    this.paying = true;
    this.paymentError = '';
    this.paymentSuccess = false;

    try {
      let invoice = this.payInput.trim();

      // Check if it's a lightning address
      if (this.nwcService.isLightningAddress(invoice)) {
        if (this.payAmount <= 0) {
          this.paymentError = 'Please enter an amount for lightning address payments';
          this.paying = false;
          return;
        }
        // Resolve lightning address to invoice
        invoice = await this.nwcService.resolveLightningAddress(
          invoice,
          this.payAmount * 1000 // Convert sats to millisats
        );
      }

      // Pay the invoice
      await this.nwcService.payInvoice(
        this.selectedConnectionId,
        invoice,
        this.payAmount > 0 ? this.payAmount * 1000 : undefined
      );

      this.paymentSuccess = true;

      // Refresh balance and transactions after payment
      await this.refreshWallet();

      // Close modal after a delay
      setTimeout(() => {
        this.closePayModal();
      }, 2000);
    } catch (error) {
      this.paymentError =
        error instanceof Error ? error.message : 'Payment failed';
    } finally {
      this.paying = false;
    }
  }

  formatTransactionTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  formatProofTime(isoTimestamp: string | undefined): string {
    if (!isoTimestamp) return '—';

    const date = new Date(isoTimestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }

  // Cashu onboarding methods
  dismissCashuInfo() {
    this.showCashuInfo = false;
  }

  navigateToSettings() {
    this.#router.navigateByUrl('/home/settings');
  }
}
