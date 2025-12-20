import {
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  StorageService,
} from '@common';
import { LockedVaultContext } from './identity';

export const deletePermission = async function (
  this: StorageService,
  permissionId: string
): Promise<void> {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  browserSessionData.permissions = browserSessionData.permissions.filter(
    (x) => x.id !== permissionId
  );
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  const encryptedPermissionId = await this.encrypt(permissionId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_Permissions({
    permissions: browserSyncData.permissions.filter(
      (x) => x.id !== encryptedPermissionId
    ),
  });
};

export const decryptPermission = async function (
  this: StorageService,
  permission: Permission_ENCRYPTED,
  withLockedVault: LockedVaultContext | undefined = undefined
): Promise<Permission_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    const decryptedPermission: Permission_DECRYPTED = {
      id: await this.decrypt(permission.id, 'string'),
      identityId: await this.decrypt(permission.identityId, 'string'),
      method: await this.decrypt(permission.method, 'string'),
      methodPolicy: await this.decrypt(permission.methodPolicy, 'string'),
      host: await this.decrypt(permission.host, 'string'),
    };
    if (permission.kind) {
      decryptedPermission.kind = await this.decrypt(permission.kind, 'number');
    }
    return decryptedPermission;
  }

  // v2: Use pre-derived key
  if (withLockedVault.keyBase64) {
    const decryptedPermission: Permission_DECRYPTED = {
      id: await this.decryptWithLockedVaultV2(
        permission.id,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      identityId: await this.decryptWithLockedVaultV2(
        permission.identityId,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      method: await this.decryptWithLockedVaultV2(
        permission.method,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      methodPolicy: await this.decryptWithLockedVaultV2(
        permission.methodPolicy,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      host: await this.decryptWithLockedVaultV2(
        permission.host,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
    };
    if (permission.kind) {
      decryptedPermission.kind = await this.decryptWithLockedVaultV2(
        permission.kind,
        'number',
        withLockedVault.iv,
        withLockedVault.keyBase64
      );
    }
    return decryptedPermission;
  }

  // v1: Use password (PBKDF2)
  const decryptedPermission: Permission_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      permission.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    identityId: await this.decryptWithLockedVault(
      permission.identityId,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    method: await this.decryptWithLockedVault(
      permission.method,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    methodPolicy: await this.decryptWithLockedVault(
      permission.methodPolicy,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    host: await this.decryptWithLockedVault(
      permission.host,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
  };
  if (permission.kind) {
    decryptedPermission.kind = await this.decryptWithLockedVault(
      permission.kind,
      'number',
      withLockedVault.iv,
      withLockedVault.password!
    );
  }
  return decryptedPermission;
};

export const decryptPermissions = async function (
  this: StorageService,
  permissions: Permission_ENCRYPTED[],
  withLockedVault: LockedVaultContext | undefined = undefined
): Promise<Permission_DECRYPTED[]> {
  const decryptedPermissions: Permission_DECRYPTED[] = [];

  for (const permission of permissions) {
    try {
      const decryptedPermission = await decryptPermission.call(
        this,
        permission,
        withLockedVault
      );
      decryptedPermissions.push(decryptedPermission);
    } catch (error) {
      // Skip corrupted permissions (e.g., encrypted with wrong key)
      console.warn('[vault] Skipping corrupted permission:', error);
    }
  }

  return decryptedPermissions;
};
