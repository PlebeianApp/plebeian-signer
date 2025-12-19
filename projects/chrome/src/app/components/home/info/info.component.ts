import { Component } from '@angular/core';
import packageJson from '../../../../../../../package.json';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrl: './info.component.scss',
})
export class InfoComponent {
  version = packageJson.custom.chrome.version;
}
