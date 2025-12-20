import { Component } from '@angular/core';

@Component({
  selector: 'app-deriving-modal',
  templateUrl: './deriving-modal.component.html',
  styleUrl: './deriving-modal.component.scss',
})
export class DerivingModalComponent {
  visible = false;
  message = 'Deriving encryption key';

  /**
   * Show the deriving modal
   * @param message Optional custom message
   */
  show(message?: string): void {
    if (message) {
      this.message = message;
    }
    this.visible = true;
  }

  /**
   * Hide the modal
   */
  hide(): void {
    this.visible = false;
  }
}
