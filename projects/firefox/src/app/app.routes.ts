import { Routes } from '@angular/router';
import { HomeComponent as VaultCreateHomeComponent } from './components/vault-create/home/home.component';
import { NewComponent as VaultCreateNewComponent } from './components/vault-create/new/new.component';
import { HomeComponent } from './components/home/home.component';
import { IdentitiesComponent } from './components/home/identities/identities.component';
import { IdentityComponent } from './components/home/identity/identity.component';
import { InfoComponent } from './components/home/info/info.component';
import { SettingsComponent } from './components/home/settings/settings.component';
import { LogsComponent } from './components/home/logs/logs.component';
import { BookmarksComponent } from './components/home/bookmarks/bookmarks.component';
import { NewIdentityComponent } from './components/new-identity/new-identity.component';
import { EditIdentityComponent } from './components/edit-identity/edit-identity.component';
import { HomeComponent as EditIdentityHomeComponent } from './components/edit-identity/home/home.component';
import { KeysComponent as EditIdentityKeysComponent } from './components/edit-identity/keys/keys.component';
import { PermissionsComponent as EditIdentityPermissionsComponent } from './components/edit-identity/permissions/permissions.component';
import { RelaysComponent as EditIdentityRelaysComponent } from './components/edit-identity/relays/relays.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { VaultLoginComponent } from './components/vault-login/vault-login.component';
import { VaultCreateComponent } from './components/vault-create/vault-create.component';
import { VaultImportComponent } from './components/vault-import/vault-import.component';
import { WhitelistedAppsComponent } from './components/whitelisted-apps/whitelisted-apps.component';
import { ProfileEditComponent } from './components/profile-edit/profile-edit.component';

export const routes: Routes = [
  {
    path: 'welcome',
    component: WelcomeComponent,
  },
  {
    path: 'vault-login',
    component: VaultLoginComponent,
  },
  {
    path: 'vault-create',
    component: VaultCreateComponent,
    children: [
      {
        path: 'home',
        component: VaultCreateHomeComponent,
      },
      {
        path: 'new',
        component: VaultCreateNewComponent,
      },
    ],
  },
  {
    path: 'vault-import',
    component: VaultImportComponent,
  },
  {
    path: 'home',
    component: HomeComponent,
    children: [
      {
        path: 'identities',
        component: IdentitiesComponent,
      },
      {
        path: 'identity',
        component: IdentityComponent,
      },
      {
        path: 'info',
        component: InfoComponent,
      },
      {
        path: 'settings',
        component: SettingsComponent,
      },
      {
        path: 'logs',
        component: LogsComponent,
      },
      {
        path: 'bookmarks',
        component: BookmarksComponent,
      },
    ],
  },
  {
    path: 'new-identity',
    component: NewIdentityComponent,
  },
  {
    path: 'whitelisted-apps',
    component: WhitelistedAppsComponent,
  },
  {
    path: 'profile-edit',
    component: ProfileEditComponent,
  },
  {
    path: 'edit-identity/:id',
    component: EditIdentityComponent,
    children: [
      {
        path: 'home',
        component: EditIdentityHomeComponent,
      },
      {
        path: 'keys',
        component: EditIdentityKeysComponent,
      },
      {
        path: 'permissions',
        component: EditIdentityPermissionsComponent,
      },
      {
        path: 'relays',
        component: EditIdentityRelaysComponent,
      },
    ],
  },
];
