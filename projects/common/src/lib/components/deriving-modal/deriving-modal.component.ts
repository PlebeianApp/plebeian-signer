import {
  Component,
  OnDestroy,
} from '@angular/core';

@Component({
  selector: 'app-deriving-modal',
  templateUrl: './deriving-modal.component.html',
  styleUrl: './deriving-modal.component.scss',
})
export class DerivingModalComponent implements OnDestroy {
  visible = false;
  elapsed = 0;
  message = 'Deriving encryption key';

  #startTime: number | null = null;
  #animationFrame: number | null = null;

  /**
   * Show the deriving modal and start the timer
   * @param message Optional custom message
   */
  show(message?: string): void {
    if (message) {
      this.message = message;
    }
    this.visible = true;
    this.elapsed = 0;
    this.#startTime = performance.now();
    this.#updateTimer();
  }

  /**
   * Hide the modal and stop the timer
   */
  hide(): void {
    this.visible = false;
    this.#stopTimer();
  }

  ngOnDestroy(): void {
    this.#stopTimer();
  }

  #updateTimer(): void {
    if (this.#startTime !== null) {
      this.elapsed = (performance.now() - this.#startTime) / 1000;
      this.#animationFrame = requestAnimationFrame(() => this.#updateTimer());
    }
  }

  #stopTimer(): void {
    this.#startTime = null;
    if (this.#animationFrame !== null) {
      cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
    }
  }
}
