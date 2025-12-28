import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IconButtonComponent,
  NavComponent,
  NostrHelper,
  StorageService,
  ToastComponent,
} from '@common';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-ncryptsec',
  imports: [IconButtonComponent, FormsModule, ToastComponent],
  templateUrl: './ncryptsec.component.html',
  styleUrl: './ncryptsec.component.scss',
})
export class NcryptsecComponent
  extends NavComponent
  implements OnInit, AfterViewInit
{
  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;

  privkeyHex = '';
  ncryptsecPassword = '';
  ncryptsec = '';
  ncryptsecQr = '';
  isGenerating = false;

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);

  ngOnInit(): void {
    const identityId = this.#activatedRoute.parent?.snapshot.params['id'];
    if (!identityId) {
      return;
    }

    this.#initialize(identityId);
  }

  ngAfterViewInit(): void {
    this.passwordInput.nativeElement.focus();
  }

  async generateNcryptsec() {
    if (!this.privkeyHex || !this.ncryptsecPassword) {
      return;
    }

    this.isGenerating = true;
    this.ncryptsec = '';
    this.ncryptsecQr = '';

    try {
      this.ncryptsec = await NostrHelper.privkeyToNcryptsec(
        this.privkeyHex,
        this.ncryptsecPassword
      );

      // Generate QR code
      this.ncryptsecQr = await QRCode.toDataURL(this.ncryptsec, {
        width: 250,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch (error) {
      console.error('Failed to generate ncryptsec:', error);
    } finally {
      this.isGenerating = false;
    }
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  #initialize(identityId: string) {
    const identity = this.#storage
      .getBrowserSessionHandler()
      .browserSessionData?.identities.find((x) => x.id === identityId);

    if (!identity) {
      return;
    }

    this.privkeyHex = identity.privkey;
  }
}
