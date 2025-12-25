import { IdentityId, PermissionId } from '../value-objects';
import type {
  PermissionSnapshot,
  ExtensionMethod,
  PermissionPolicy,
} from '../repositories/permission-repository';

/**
 * Permission entity - represents an authorization decision for
 * a specific identity, host, and method combination.
 *
 * Permissions are immutable once created - to change a permission,
 * delete it and create a new one.
 */
export class Permission {
  private readonly _id: PermissionId;
  private readonly _identityId: IdentityId;
  private readonly _host: string;
  private readonly _method: ExtensionMethod;
  private readonly _policy: PermissionPolicy;
  private readonly _kind?: number;

  private constructor(
    id: PermissionId,
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    policy: PermissionPolicy,
    kind?: number
  ) {
    this._id = id;
    this._identityId = identityId;
    this._host = host;
    this._method = method;
    this._policy = policy;
    this._kind = kind;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factory Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create an "allow" permission.
   */
  static allow(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    kind?: number
  ): Permission {
    return new Permission(
      PermissionId.generate(),
      identityId,
      Permission.normalizeHost(host),
      method,
      'allow',
      kind
    );
  }

  /**
   * Create a "deny" permission.
   */
  static deny(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    kind?: number
  ): Permission {
    return new Permission(
      PermissionId.generate(),
      identityId,
      Permission.normalizeHost(host),
      method,
      'deny',
      kind
    );
  }

  /**
   * Create a permission with explicit policy.
   */
  static create(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    policy: PermissionPolicy,
    kind?: number
  ): Permission {
    return new Permission(
      PermissionId.generate(),
      identityId,
      Permission.normalizeHost(host),
      method,
      policy,
      kind
    );
  }

  /**
   * Reconstitute a permission from storage.
   */
  static fromSnapshot(snapshot: PermissionSnapshot): Permission {
    return new Permission(
      PermissionId.from(snapshot.id),
      IdentityId.from(snapshot.identityId),
      snapshot.host,
      snapshot.method,
      snapshot.methodPolicy,
      snapshot.kind
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────────────

  get id(): PermissionId {
    return this._id;
  }

  get identityId(): IdentityId {
    return this._identityId;
  }

  get host(): string {
    return this._host;
  }

  get method(): ExtensionMethod {
    return this._method;
  }

  get policy(): PermissionPolicy {
    return this._policy;
  }

  get kind(): number | undefined {
    return this._kind;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if this permission allows the action.
   */
  isAllowed(): boolean {
    return this._policy === 'allow';
  }

  /**
   * Check if this permission denies the action.
   */
  isDenied(): boolean {
    return this._policy === 'deny';
  }

  /**
   * Check if this permission matches the given criteria.
   * For signEvent with kind specified, also checks the kind.
   */
  matches(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    kind?: number
  ): boolean {
    if (!this._identityId.equals(identityId)) {
      return false;
    }

    if (this._host !== Permission.normalizeHost(host)) {
      return false;
    }

    if (this._method !== method) {
      return false;
    }

    // For signEvent, handle kind matching
    if (method === 'signEvent') {
      // If this permission has no kind, it matches all kinds
      if (this._kind === undefined) {
        return true;
      }
      // If checking a specific kind, must match exactly
      return this._kind === kind;
    }

    return true;
  }

  /**
   * Check if this permission applies to a specific event kind.
   * Only relevant for signEvent method.
   */
  appliesToKind(kind: number): boolean {
    if (this._method !== 'signEvent') {
      return false;
    }
    // No kind restriction means applies to all
    if (this._kind === undefined) {
      return true;
    }
    return this._kind === kind;
  }

  /**
   * Check if this is a blanket permission (no kind restriction).
   */
  isBlanketPermission(): boolean {
    return this._method === 'signEvent' && this._kind === undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert to a snapshot for persistence.
   */
  toSnapshot(): PermissionSnapshot {
    const snapshot: PermissionSnapshot = {
      id: this._id.value,
      identityId: this._identityId.value,
      host: this._host,
      method: this._method,
      methodPolicy: this._policy,
    };

    if (this._kind !== undefined) {
      snapshot.kind = this._kind;
    }

    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Equality
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check equality based on permission ID.
   */
  equals(other: Permission): boolean {
    return this._id.equals(other._id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private static normalizeHost(host: string): string {
    return host.toLowerCase().trim();
  }
}

/**
 * Permission checker - evaluates permissions for a request.
 * This encapsulates the permission checking logic.
 */
export class PermissionChecker {
  constructor(private readonly permissions: Permission[]) {}

  /**
   * Check if an action is allowed.
   *
   * @returns true if allowed, false if denied, undefined if no matching permission
   */
  check(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    kind?: number
  ): boolean | undefined {
    const matching = this.permissions.filter((p) =>
      p.matches(identityId, host, method, kind)
    );

    if (matching.length === 0) {
      return undefined;
    }

    // For signEvent with kind, check specific rules
    // Kind-specific rules take priority over blanket rules
    if (method === 'signEvent' && kind !== undefined) {
      // Check for specific kind deny first (takes priority)
      if (matching.some((p) => p.kind === kind && p.isDenied())) {
        return false;
      }

      // Check for specific kind allow
      if (matching.some((p) => p.kind === kind && p.isAllowed())) {
        return true;
      }

      // Fall back to blanket allow (no kind restriction)
      if (matching.some((p) => p.isBlanketPermission() && p.isAllowed())) {
        return true;
      }

      // Fall back to blanket deny
      if (matching.some((p) => p.isBlanketPermission() && p.isDenied())) {
        return false;
      }

      // No specific rule found
      return undefined;
    }

    // For other methods, all matching permissions must allow
    return matching.every((p) => p.isAllowed());
  }

  /**
   * Get all permissions for a specific identity.
   */
  forIdentity(identityId: IdentityId): Permission[] {
    return this.permissions.filter((p) => p.identityId.equals(identityId));
  }

  /**
   * Get all permissions for a specific host.
   */
  forHost(host: string): Permission[] {
    const normalizedHost = host.toLowerCase().trim();
    return this.permissions.filter((p) => p.host === normalizedHost);
  }
}
