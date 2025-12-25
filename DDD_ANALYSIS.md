# Domain-Driven Design Analysis: Plebeian Signer

This document analyzes the Plebeian Signer codebase through the lens of Domain-Driven Design (DDD) principles, identifying bounded contexts, current patterns, anti-patterns, and providing actionable recommendations for improvement.

## Executive Summary

Plebeian Signer is a browser extension for Nostr identity management implementing NIP-07. The codebase has **good structural foundations** (monorepo with shared library, handler abstraction pattern) but suffers from several DDD anti-patterns:

- **God Service**: `StorageService` handles too many responsibilities
- **Anemic Domain Models**: Types are data containers without behavior
- **Mixed Concerns**: Encryption logic interleaved with domain operations
- **Weak Ubiquitous Language**: Generic naming (`BrowserSyncData`) obscures domain concepts

**Priority Recommendations:**
1. Extract domain aggregates with behavior (Identity, Vault, Wallet)
2. Separate encryption into an infrastructure layer
3. Introduce repository pattern for each aggregate
4. Rename types to reflect ubiquitous language

---

## Domain Overview

### Core Domain Problem

> Enable users to manage multiple Nostr identities securely, sign events without exposing private keys to web applications, and interact with Lightning/Cashu wallets.

### Subdomain Classification

| Subdomain | Type | Rationale |
|-----------|------|-----------|
| **Identity & Signing** | Core | The differentiator - secure key management and NIP-07 implementation |
| **Permission Management** | Core | Critical security layer - controls what apps can do |
| **Vault Encryption** | Supporting | Necessary security but standard cryptographic patterns |
| **Wallet Integration** | Supporting | Extends functionality but not the core value proposition |
| **Profile Caching** | Generic | Standard caching pattern, could use any solution |
| **Relay Management** | Supporting | Per-identity configuration, fairly standard |

---

## Bounded Contexts

### Identified Contexts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTEXT MAP                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐        Shared Kernel        ┌──────────────────┐      │
│  │  Vault Context   │◄─────────(crypto)──────────►│ Identity Context │      │
│  │                  │                              │                  │      │
│  │  - VaultState    │                              │  - Identity      │      │
│  │  - Encryption    │                              │  - KeyPair       │      │
│  │  - Migration     │                              │  - Signing       │      │
│  └────────┬─────────┘                              └────────┬─────────┘      │
│           │                                                  │               │
│           │ Customer/Supplier                                │               │
│           ▼                                                  ▼               │
│  ┌──────────────────┐                              ┌──────────────────┐      │
│  │ Permission Ctx   │                              │  Wallet Context  │      │
│  │                  │                              │                  │      │
│  │  - Policy        │                              │  - NWC           │      │
│  │  - Host Rules    │                              │  - Cashu         │      │
│  │  - Method Auth   │                              │  - Lightning     │      │
│  └──────────────────┘                              └──────────────────┘      │
│                                                                              │
│  ┌──────────────────┐                              ┌──────────────────┐      │
│  │  Relay Context   │◄──── Conformist ────────────►│  Profile Context │      │
│  │                  │                              │                  │      │
│  │  - Per-identity  │                              │  - Kind 0 cache  │      │
│  │  - Read/Write    │                              │  - Metadata      │      │
│  └──────────────────┘                              └──────────────────┘      │
│                                                                              │
│  Legend: ◄──► Bidirectional, ──► Supplier direction                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context Definitions

#### 1. Vault Context
**Responsibility:** Secure storage lifecycle - creation, locking, unlocking, encryption, migration.

**Current Location:** `projects/common/src/lib/services/storage/related/vault.ts`

**Key Concepts:**
- VaultState (locked/unlocked)
- EncryptionKey (Argon2id-derived)
- VaultVersion (migration support)
- Salt, IV (cryptographic parameters)

**Language:**
| Term | Definition |
|------|------------|
| Vault | The encrypted container holding all sensitive data |
| Unlock | Derive key from password and decrypt vault contents |
| Lock | Clear session data, requiring password to access again |
| Migration | Upgrade vault encryption scheme (v1→v2) |

#### 2. Identity Context
**Responsibility:** Nostr identity lifecycle and cryptographic operations.

**Current Location:** `projects/common/src/lib/services/storage/related/identity.ts`

**Key Concepts:**
- Identity (aggregates pubkey, privkey, nick)
- KeyPair (hex or nsec/npub representations)
- SelectedIdentity (current active identity)
- EventSigning (NIP-07 signEvent)

**Language:**
| Term | Definition |
|------|------------|
| Identity | A Nostr keypair with a user-defined nickname |
| Selected Identity | The currently active identity for signing |
| Sign | Create schnorr signature for a Nostr event |
| Switch | Change the active identity |

#### 3. Permission Context
**Responsibility:** Authorization decisions for NIP-07 method calls.

**Current Location:** `projects/common/src/lib/services/storage/related/permission.ts`

**Key Concepts:**
- PermissionPolicy (allow/deny)
- MethodPermission (per NIP-07 method)
- KindPermission (signEvent kind filtering)
- HostWhitelist (trusted domains)
- RecklessMode (auto-approve all)

**Language:**
| Term | Definition |
|------|------------|
| Permission | A stored allow/deny decision for identity+host+method |
| Reckless Mode | Global setting to auto-approve all requests |
| Whitelist | Hosts that auto-approve without prompting |
| Prompt | UI asking user to authorize a request |

#### 4. Wallet Context
**Responsibility:** Lightning and Cashu wallet operations.

**Current Location:**
- `projects/common/src/lib/services/nwc/`
- `projects/common/src/lib/services/cashu/`
- `projects/common/src/lib/services/storage/related/nwc.ts`
- `projects/common/src/lib/services/storage/related/cashu.ts`

**Key Concepts:**
- NwcConnection (NIP-47 wallet connect)
- CashuMint (ecash mint connection)
- CashuProof (unspent tokens)
- LightningInvoice, Keysend

#### 5. Relay Context
**Responsibility:** Per-identity relay configuration.

**Current Location:** `projects/common/src/lib/services/storage/related/relay.ts`

**Key Concepts:**
- RelayConfiguration (URL + read/write permissions)
- IdentityRelays (relays scoped to an identity)

#### 6. Profile Context
**Responsibility:** Caching Nostr profile metadata (kind 0 events).

**Current Location:** `projects/common/src/lib/services/profile-metadata/`

**Key Concepts:**
- ProfileMetadata (name, picture, nip05, etc.)
- MetadataCache (fetchedAt timestamp)

---

## Current Architecture Analysis

### What's Working Well

1. **Monorepo Structure**
   - Clean separation: `projects/common`, `projects/chrome`, `projects/firefox`
   - Shared library via `@common` alias
   - Browser-specific implementations isolated

2. **Handler Abstraction (Adapter Pattern)**
   ```
   StorageService
     ├→ BrowserSessionHandler  (abstract → ChromeSessionHandler, FirefoxSessionHandler)
     ├→ BrowserSyncHandler     (abstract → ChromeSyncYesHandler, ChromeSyncNoHandler, ...)
     └→ SignerMetaHandler      (abstract → ChromeMetaHandler, FirefoxMetaHandler)
   ```
   This enables pluggable browser implementations - good DDD practice.

3. **Encrypted/Decrypted Type Pairs**
   - `Identity_DECRYPTED` / `Identity_ENCRYPTED`
   - Clear distinction between storage states

4. **Vault Versioning**
   - Migration path from v1 (PBKDF2) to v2 (Argon2id)
   - Automatic upgrade on unlock

5. **Cascade Deletes**
   - Deleting an identity removes associated permissions and relays
   - Maintains referential integrity

### Anti-Patterns Identified

#### 1. God Service (`StorageService`)

**Location:** `projects/common/src/lib/services/storage/storage.service.ts`

**Problem:** Single service handles:
- Vault lifecycle (create, unlock, delete, migrate)
- Identity CRUD (add, delete, switch)
- Permission management
- Relay configuration
- NWC wallet connections
- Cashu mint management
- Encryption/decryption orchestration

**Symptoms:**
- 500+ lines when including bound methods
- Methods dynamically attached via functional composition
- Implicit dependencies between operations
- Difficult to test in isolation

**DDD Violation:** Violates single responsibility; should be split into aggregate-specific repositories.

#### 2. Anemic Domain Models

**Location:** `projects/common/src/lib/services/storage/types.ts`

**Problem:** All domain types are pure data containers:

```typescript
// Current: Anemic model
interface Identity_DECRYPTED {
  id: string;
  nick: string;
  privkey: string;
  createdAt: string;
}

// All behavior lives in external functions:
// - addIdentity() in identity.ts
// - switchIdentity() in identity.ts
// - encryptIdentity() in identity.ts
```

**Should Be:**
```typescript
// Rich domain model
class Identity {
  private constructor(
    private readonly _id: IdentityId,
    private _nick: Nickname,
    private readonly _keyPair: NostrKeyPair,
    private readonly _createdAt: Date
  ) {}

  static create(nick: string, privateKey?: string): Identity { /* ... */ }

  get publicKey(): string { return this._keyPair.publicKey; }

  sign(event: UnsignedEvent): SignedEvent {
    return this._keyPair.sign(event);
  }

  rename(newNick: string): void {
    this._nick = Nickname.create(newNick);
  }
}
```

#### 3. Mixed Encryption Concerns

**Problem:** Domain operations and encryption logic are interleaved:

```typescript
// In identity.ts
export async function addIdentity(this: StorageService, data: {...}) {
  // Domain logic
  const identity_decrypted: Identity_DECRYPTED = {
    id: uuid(),
    nick: data.nick,
    privkey: data.privkeyString,
    createdAt: new Date().toISOString(),
  };

  // Encryption concern mixed in
  const identity_encrypted = await encryptIdentity.call(this, identity_decrypted);

  // Storage concern
  await this.#browserSyncHandler.addIdentity(identity_encrypted);
  this.#browserSessionHandler.addIdentity(identity_decrypted);
}
```

**Should Be:** Encryption as infrastructure layer, repositories handle persistence:

```typescript
class IdentityRepository {
  async save(identity: Identity): Promise<void> {
    const encrypted = this.encryptionService.encrypt(identity.toSnapshot());
    await this.syncHandler.save(encrypted);
    this.sessionHandler.cache(identity);
  }
}
```

#### 4. Weak Ubiquitous Language

**Problem:** Type names reflect technical storage, not domain concepts:

| Current Name | Domain Concept |
|--------------|----------------|
| `BrowserSyncData` | `EncryptedVault` |
| `BrowserSessionData` | `UnlockedVaultState` |
| `SignerMetaData` | `ExtensionSettings` |
| `Identity_DECRYPTED` | `Identity` |
| `Identity_ENCRYPTED` | `EncryptedIdentity` |

#### 5. Implicit Aggregate Boundaries

**Problem:** No clear aggregate roots. External code can manipulate any data:

```typescript
// Anyone can reach into session data
const identity = this.#browserSessionHandler.getIdentity(id);
identity.nick = "changed";  // No invariant protection!
```

**Should Have:** Aggregate roots as single entry points with invariant protection.

#### 6. TypeScript Union Type Issues

**Problem:** `LockedVaultContext` uses optional fields instead of discriminated unions:

```typescript
// Current: Confusing optional fields
type LockedVaultContext =
  | { iv: string; password: string; keyBase64?: undefined }
  | { iv: string; keyBase64: string; password?: undefined };

// Better: Discriminated union
type LockedVaultContext =
  | { version: 1; iv: string; password: string }
  | { version: 2; iv: string; keyBase64: string };
```

---

## Recommended Domain Model

### Aggregate Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGGREGATE MAP                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Vault Aggregate (Root: Vault)                                │    │
│  │                                                              │    │
│  │  Vault ──────┬──► Identity[] (child entities)               │    │
│  │              ├──► Permission[] (child entities)              │    │
│  │              ├──► Relay[] (child entities)                   │    │
│  │              ├──► NwcConnection[] (child entities)           │    │
│  │              └──► CashuMint[] (child entities)               │    │
│  │                                                              │    │
│  │  Invariants:                                                 │    │
│  │  - At most one identity can be selected                      │    │
│  │  - Permissions must reference existing identities            │    │
│  │  - Relays must reference existing identities                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ExtensionSettings Aggregate (Root: ExtensionSettings)        │    │
│  │                                                              │    │
│  │  ExtensionSettings ──┬──► SyncPreference                    │    │
│  │                      ├──► SecurityPolicy (reckless, whitelist)│   │
│  │                      ├──► Bookmark[]                         │    │
│  │                      └──► VaultSnapshot[]                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ProfileCache Aggregate (Root: ProfileCache)                  │    │
│  │                                                              │    │
│  │  ProfileCache ──► ProfileMetadata[]                         │    │
│  │                                                              │    │
│  │  Invariants:                                                 │    │
│  │  - Entries expire after TTL                                  │    │
│  │  - One entry per pubkey                                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Value Objects

```typescript
// Strongly-typed identity
class IdentityId {
  private constructor(private readonly value: string) {}
  static generate(): IdentityId { return new IdentityId(uuid()); }
  static from(value: string): IdentityId { return new IdentityId(value); }
  equals(other: IdentityId): boolean { return this.value === other.value; }
  toString(): string { return this.value; }
}

// Self-validating nickname
class Nickname {
  private constructor(private readonly value: string) {}
  static create(value: string): Nickname {
    if (!value || value.trim().length === 0) {
      throw new InvalidNicknameError(value);
    }
    return new Nickname(value.trim());
  }
  toString(): string { return this.value; }
}

// Nostr key pair encapsulation
class NostrKeyPair {
  private constructor(
    private readonly privateKeyHex: string,
    private readonly publicKeyHex: string
  ) {}

  static fromPrivateKey(privkey: string): NostrKeyPair {
    const hex = privkey.startsWith('nsec')
      ? NostrHelper.nsecToHex(privkey)
      : privkey;
    const pubkey = NostrHelper.pubkeyFromPrivkey(hex);
    return new NostrKeyPair(hex, pubkey);
  }

  get publicKey(): string { return this.publicKeyHex; }
  get npub(): string { return NostrHelper.pubkey2npub(this.publicKeyHex); }

  sign(event: UnsignedEvent): SignedEvent {
    return NostrHelper.signEvent(event, this.privateKeyHex);
  }

  encrypt(plaintext: string, recipientPubkey: string, version: 4 | 44): string {
    return version === 4
      ? NostrHelper.nip04Encrypt(plaintext, this.privateKeyHex, recipientPubkey)
      : NostrHelper.nip44Encrypt(plaintext, this.privateKeyHex, recipientPubkey);
  }
}

// Permission policy
class PermissionPolicy {
  private constructor(
    private readonly identityId: IdentityId,
    private readonly host: string,
    private readonly method: Nip07Method,
    private readonly decision: 'allow' | 'deny',
    private readonly kind?: number
  ) {}

  static allow(identityId: IdentityId, host: string, method: Nip07Method, kind?: number): PermissionPolicy {
    return new PermissionPolicy(identityId, host, method, 'allow', kind);
  }

  static deny(identityId: IdentityId, host: string, method: Nip07Method, kind?: number): PermissionPolicy {
    return new PermissionPolicy(identityId, host, method, 'deny', kind);
  }

  matches(identityId: IdentityId, host: string, method: Nip07Method, kind?: number): boolean {
    return this.identityId.equals(identityId)
      && this.host === host
      && this.method === method
      && (this.kind === undefined || this.kind === kind);
  }

  isAllowed(): boolean { return this.decision === 'allow'; }
}
```

### Rich Domain Entities

```typescript
class Identity {
  private readonly _id: IdentityId;
  private _nickname: Nickname;
  private readonly _keyPair: NostrKeyPair;
  private readonly _createdAt: Date;
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    id: IdentityId,
    nickname: Nickname,
    keyPair: NostrKeyPair,
    createdAt: Date
  ) {
    this._id = id;
    this._nickname = nickname;
    this._keyPair = keyPair;
    this._createdAt = createdAt;
  }

  static create(nickname: string, privateKey?: string): Identity {
    const keyPair = privateKey
      ? NostrKeyPair.fromPrivateKey(privateKey)
      : NostrKeyPair.generate();

    const identity = new Identity(
      IdentityId.generate(),
      Nickname.create(nickname),
      keyPair,
      new Date()
    );

    identity._domainEvents.push(new IdentityCreated(identity._id, identity.publicKey));
    return identity;
  }

  get id(): IdentityId { return this._id; }
  get publicKey(): string { return this._keyPair.publicKey; }
  get npub(): string { return this._keyPair.npub; }
  get nickname(): string { return this._nickname.toString(); }

  rename(newNickname: string): void {
    const oldNickname = this._nickname.toString();
    this._nickname = Nickname.create(newNickname);
    this._domainEvents.push(new IdentityRenamed(this._id, oldNickname, newNickname));
  }

  sign(event: UnsignedEvent): SignedEvent {
    return this._keyPair.sign(event);
  }

  encrypt(plaintext: string, recipientPubkey: string, version: 4 | 44): string {
    return this._keyPair.encrypt(plaintext, recipientPubkey, version);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
```

---

## Refactoring Roadmap

### Phase 1: Extract Value Objects (Low Risk)

**Goal:** Introduce type safety without changing behavior.

1. Create `IdentityId`, `Nickname`, `NostrKeyPair` value objects
2. Use them in existing interfaces initially
3. Add validation in factory methods
4. Update helpers to use value objects

**Files to Modify:**
- Create `projects/common/src/lib/domain/value-objects/`
- Update `projects/common/src/lib/helpers/nostr-helper.ts`

### Phase 2: Introduce Repository Pattern (Medium Risk)

**Goal:** Separate storage concerns from domain logic.

1. Define repository interfaces in domain layer
2. Create `IdentityRepository`, `PermissionRepository`, etc.
3. Move encryption to `EncryptionService` infrastructure
4. Refactor `StorageService` to delegate to repositories

**New Structure:**
```
projects/common/src/lib/
├── domain/
│   ├── identity/
│   │   ├── Identity.ts
│   │   ├── IdentityRepository.ts (interface)
│   │   └── events/
│   ├── permission/
│   │   ├── PermissionPolicy.ts
│   │   └── PermissionRepository.ts (interface)
│   └── vault/
│       ├── Vault.ts
│       └── VaultRepository.ts (interface)
├── infrastructure/
│   ├── encryption/
│   │   └── EncryptionService.ts
│   └── persistence/
│       ├── ChromeIdentityRepository.ts
│       └── FirefoxIdentityRepository.ts
└── application/
    ├── IdentityApplicationService.ts
    └── VaultApplicationService.ts
```

### Phase 3: Rich Domain Model (Higher Risk)

**Goal:** Move behavior into domain entities.

1. Convert `Identity_DECRYPTED` interface to `Identity` class
2. Move signing logic into `Identity.sign()`
3. Move encryption decision logic into domain
4. Add domain events for state changes

### Phase 4: Ubiquitous Language Cleanup

**Goal:** Align code with domain language.

| Old Name | New Name |
|----------|----------|
| `BrowserSyncData` | `EncryptedVault` |
| `BrowserSessionData` | `VaultSession` |
| `SignerMetaData` | `ExtensionSettings` |
| `StorageService` | `VaultService` (or split into multiple) |
| `addIdentity()` | `Identity.create()` + `IdentityRepository.save()` |
| `switchIdentity()` | `Vault.selectIdentity()` |

---

## Implementation Priorities

### High Priority (Security/Correctness)

1. **Encapsulate KeyPair operations** - Private keys should never be accessed directly
2. **Enforce invariants** - Selected identity must exist, permissions must reference valid identities
3. **Clear transaction boundaries** - What gets saved together?

### Medium Priority (Maintainability)

1. **Split StorageService** - Into VaultService, IdentityRepository, PermissionRepository
2. **Extract EncryptionService** - Pure infrastructure concern
3. **Type-safe IDs** - Prevent mixing up identity IDs with permission IDs

### Lower Priority (Polish)

1. **Domain events** - For audit trail and extensibility
2. **Full ubiquitous language** - Rename all types
3. **Discriminated unions** - For vault context types

---

## Testing Implications

Current state makes testing difficult because:
- `StorageService` requires mocking 4 handlers
- Encryption is interleaved with logic
- No clear boundaries to test in isolation

With proposed changes:
- Domain entities testable in isolation (no storage mocks)
- Repositories testable with in-memory implementations
- Clear separation enables focused unit tests

```typescript
// Example: Testing Identity domain logic
describe('Identity', () => {
  it('signs events with internal keypair', () => {
    const identity = Identity.create('Test', 'nsec1...');
    const event = { kind: 1, content: 'test', /* ... */ };

    const signed = identity.sign(event);

    expect(signed.sig).toBeDefined();
    expect(signed.pubkey).toBe(identity.publicKey);
  });

  it('prevents duplicate private keys via repository', async () => {
    const repository = new InMemoryIdentityRepository();
    const existing = Identity.create('First', 'nsec1abc...');
    await repository.save(existing);

    const duplicate = Identity.create('Second', 'nsec1abc...');

    await expect(repository.save(duplicate))
      .rejects.toThrow(DuplicateIdentityError);
  });
});
```

---

## Conclusion

The Plebeian Signer codebase has solid foundations but would benefit significantly from DDD tactical patterns. The recommended approach:

1. **Start with value objects** - Low risk, immediate type safety benefits
2. **Introduce repositories gradually** - Extract one at a time, starting with Identity
3. **Defer full rich domain model** - Until repositories stabilize the architecture
4. **Update language as you go** - Rename types when touching files anyway

The goal is not architectural purity but **maintainability, testability, and security**. DDD patterns are a means to those ends in a domain (cryptographic identity management) where correctness matters.
