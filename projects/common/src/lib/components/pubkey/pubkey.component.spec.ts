import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PubkeyComponent } from './pubkey.component';

describe('PubkeyComponent', () => {
  let component: PubkeyComponent;
  let fixture: ComponentFixture<PubkeyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PubkeyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PubkeyComponent);
    component = fixture.componentInstance;
    // Valid test pubkey (64 hex chars)
    component.value = 'a'.repeat(64);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
