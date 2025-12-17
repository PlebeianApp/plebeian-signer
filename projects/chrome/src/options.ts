import {
  BrowserSyncData,
  SIGNER_META_DATA_KEY,
  SignerMetaData_VaultSnapshot,
} from '@common';
import './app/common/extensions/array';
import browser from 'webextension-polyfill';

//
// Functions
//

async function getSignerMetaDataVaultSnapshots(): Promise<
  SignerMetaData_VaultSnapshot[]
> {
  const data = (await browser.storage.local.get(
    SIGNER_META_DATA_KEY.vaultSnapshots
  )) as {
    vaultSnapshots?: SignerMetaData_VaultSnapshot[];
  };

  return typeof data.vaultSnapshots === 'undefined'
    ? []
    : data.vaultSnapshots.sortBy((x) => x.fileName, 'desc');
}

async function setSignerMetaDataVaultSnapshots(
  vaultSnapshots: SignerMetaData_VaultSnapshot[]
): Promise<void> {
  await browser.storage.local.set({
    vaultSnapshots,
  });
}

function rebuildSnapshotsList(snapshots: SignerMetaData_VaultSnapshot[]) {
  const ul = document.getElementById('snapshotsList');
  if (!ul) {
    return;
  }

  // Clear the list
  ul.innerHTML = '';

  for (const snapshot of snapshots) {
    const li = document.createElement('li');

    const test =
      '"' +
      snapshot.fileName +
      '"' +
      ' -> vault version: ' +
      snapshot.data.version +
      ' -> identities: ' +
      snapshot.data.identities.length +
      ' -> relays: ' +
      snapshot.data.relays.length +
      '';

    li.innerText = test;
    ul.appendChild(li);
  }
}

//
// Main
//

document.addEventListener('DOMContentLoaded', async () => {
  const uploadSnapshotsButton = document.getElementById(
    'uploadSnapshotsButton'
  );
  const deleteSnapshotsButton = document.getElementById(
    'deleteSnapshotsButton'
  );
  const uploadSnapshotInput = document.getElementById(
    'uploadSnapshotInput'
  ) as HTMLInputElement;

  deleteSnapshotsButton?.addEventListener('click', async () => {
    await setSignerMetaDataVaultSnapshots([]);
    rebuildSnapshotsList([]);
  });

  uploadSnapshotsButton?.addEventListener('click', async () => {
    uploadSnapshotInput?.click();
  });

  uploadSnapshotInput?.addEventListener('change', async (event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files) {
      return;
    }

    try {
      const existingSnapshots = await getSignerMetaDataVaultSnapshots();

      const newSnapshots: SignerMetaData_VaultSnapshot[] = [];
      for (const file of files) {
        const text = await file.text();
        const vault = JSON.parse(text) as BrowserSyncData;

        // Check, if the "new" file is already in the list (via fileName comparison)
        if (existingSnapshots.some((x) => x.fileName === file.name)) {
          continue;
        }

        newSnapshots.push({
          fileName: file.name,
          data: vault,
        });
      }

      const snapshots = [...existingSnapshots, ...newSnapshots].sortBy(
        (x) => x.fileName,
        'desc'
      );

      // Persist the new snapshots to the local storage
      await setSignerMetaDataVaultSnapshots(snapshots);

      //
      rebuildSnapshotsList(snapshots);
    } catch (error) {
      console.log(error);
    }
  });

  const snapshots = await getSignerMetaDataVaultSnapshots();
  rebuildSnapshotsList(snapshots);
});
