import { Component, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LoggerService,
  NavComponent,
  StorageService,
  DerivingModalComponent,
} from '@common';

@Component({
  selector: 'app-new',
  imports: [FormsModule, DerivingModalComponent],
  templateUrl: './new.component.html',
  styleUrl: './new.component.scss',
})
export class NewComponent extends NavComponent {
  @ViewChild('derivingModal') derivingModal!: DerivingModalComponent;

  password = '';

  readonly #router = inject(Router);
  readonly #storage = inject(StorageService);
  readonly #logger = inject(LoggerService);

  // Access router state via history.state (persists after navigation completes)
  get #nsec(): string | undefined {
    return history.state?.nsec;
  }

  get #nickname(): string | undefined {
    return history.state?.nickname;
  }

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async createVault() {
    if (!this.password) {
      return;
    }

    // Show deriving modal during key derivation (~3-6 seconds)
    this.derivingModal.show('Creating secure vault');
    try {
      await this.#storage.createNewVault(this.password);
      this.#logger.logVaultCreated();

      // If nsec and nickname were passed, add the identity
      if (this.#nsec && this.#nickname) {
        try {
          await this.#storage.addIdentity({
            nick: this.#nickname,
            privkeyString: this.#nsec,
          });
        } catch (error) {
          console.error('Failed to add identity:', error);
        }
      }

      this.derivingModal.hide();
      this.#router.navigateByUrl('/home/identity');
    } catch (error) {
      this.derivingModal.hide();
      console.error('Failed to create vault:', error);
    }
  }
}
