import {
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
} from '@angular/core';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-relay-rw',
  imports: [],
  templateUrl: './relay-rw.component.html',
  styleUrl: './relay-rw.component.scss',
})
export class RelayRwComponent {
  @Input({ required: true }) type!: 'read' | 'write';
  @Input({ required: true }) model!: boolean;
  @Input() readonly = false;
  @Output() modelChange = new EventEmitter<boolean>();

  @HostBinding('class.read') get isRead() {
    return this.type === 'read';
  }

  @HostBinding('class.is-selected') get isSelected() {
    return this.model;
  }

  @HostBinding('class.is-readonly') get isReadonly() {
    return this.readonly;
  }

  @HostListener('click') onClick() {
    if (this.readonly) {
      return;
    }
    this.model = !this.model;
    this.modelChange.emit(this.model);
  }
}
