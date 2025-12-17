import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IconButtonComponent,
  Identity_DECRYPTED,
  NavComponent,
  Nip65Relay,
  NostrHelper,
  RelayListService,
  RelayRwComponent,
  StorageService,
  VisualRelayPipe,
} from '@common';

@Component({
  selector: 'app-relays',
  imports: [
    IconButtonComponent,
    RelayRwComponent,
    NgTemplateOutlet,
    VisualRelayPipe,
  ],
  templateUrl: './relays.component.html',
  styleUrl: './relays.component.scss',
})
export class RelaysComponent extends NavComponent implements OnInit {
  identity?: Identity_DECRYPTED;
  relays: Nip65Relay[] = [];
  loading = true;
  errorMessage = '';

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);
  readonly #relayListService = inject(RelayListService);

  ngOnInit(): void {
    const selectedIdentityId =
      this.#activatedRoute.parent?.snapshot.params['id'];
    if (!selectedIdentityId) {
      this.loading = false;
      return;
    }

    this.#loadData(selectedIdentityId);
  }

  async #loadData(identityId: string) {
    try {
      this.loading = true;
      this.errorMessage = '';

      this.identity = this.#storage
        .getBrowserSessionHandler()
        .browserSessionData?.identities.find((x) => x.id === identityId);

      if (!this.identity) {
        this.loading = false;
        this.errorMessage = 'Identity not found';
        return;
      }

      // Get the pubkey for this identity
      const pubkey = NostrHelper.pubkeyFromPrivkey(this.identity.privkey);

      // Fetch NIP-65 relay list
      const nip65Relays = await this.#relayListService.fetchRelayList(pubkey);
      this.relays = nip65Relays;

      this.loading = false;
    } catch (error) {
      console.error('Failed to load relay list:', error);
      this.loading = false;
      this.errorMessage = 'Failed to fetch relay list';
    }
  }
}
