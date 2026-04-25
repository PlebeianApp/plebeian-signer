import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { NostrHelper } from '@common';
import { IconButtonComponent } from "../icon-button/icon-button.component";

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-pubkey',
  imports: [IconButtonComponent],
  templateUrl: './pubkey.component.html',
  styleUrl: './pubkey.component.scss',
})
export class PubkeyComponent implements OnInit, OnChanges {
  @Input({ required: true }) value!: string;
  @Input() first = 9;
  @Input() last = 5;
  @Input() color = '#dee2e6bf';

  npub: string | undefined;
  npubString: string | undefined;

  ngOnInit(): void {
    this.resolvePubkey();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] || changes['first'] || changes['last']) {
      this.resolvePubkey();
    }
  }

  copyToClipboard() {
    if (!this.npub) {
      return;
    }

    navigator.clipboard.writeText(this.npub);
  }

  private resolvePubkey(): void {
    const input = (this.value ?? '').trim();
    if (!input) {
      this.npub = undefined;
      this.npubString = '';
      return;
    }

    try {
      const pubkeyObject = NostrHelper.getNostrPubkeyObject(input);
      this.npub = pubkeyObject.npub;
      this.npubString = NostrHelper.splitKey(
        pubkeyObject.npub,
        this.first,
        this.last
      );
    } catch {
      this.npub = undefined;
      this.npubString = 'invalid pubkey';
    }
  }
}
