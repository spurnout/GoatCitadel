import type {
  MeshJoinRequest,
  MeshJoinResult,
  MeshLeaseAcquireRequest,
  MeshLeaseRecord,
  MeshLeaseReleaseRequest,
  MeshLeaseRenewRequest,
  MeshNodeRecord,
  MeshReplicationIngestRequest,
  MeshReplicationOffset,
  MeshReplicationRecord,
  MeshSessionClaimRequest,
  MeshSessionOwnerRecord,
  MeshStatus,
} from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";

export interface MeshRuntimeOptions {
  enabled: boolean;
  mode: MeshStatus["mode"];
  localNodeId: string;
  localNodeLabel?: string;
  advertiseAddress?: string;
  requireMtls: boolean;
  tailnetEnabled: boolean;
  joinToken?: string;
  defaultLeaseTtlSeconds: number;
}

export class MeshService {
  private options: MeshRuntimeOptions;

  public constructor(
    private readonly storage: Storage,
    options: MeshRuntimeOptions,
  ) {
    this.options = {
      ...options,
      localNodeLabel: options.localNodeLabel,
      advertiseAddress: options.advertiseAddress,
      joinToken: options.joinToken,
    };
  }

  public init(): void {
    const now = new Date().toISOString();
    this.storage.mesh.upsertNode({
      nodeId: this.options.localNodeId,
      label: this.options.localNodeLabel,
      advertiseAddress: this.options.advertiseAddress,
      transport: this.options.mode,
      status: "online",
      capabilities: ["gateway", "scheduler", "orchestration"],
      joinedAt: now,
      lastSeenAt: now,
    });

    if (this.options.joinToken?.trim()) {
      const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
      this.storage.mesh.issueJoinToken(this.options.joinToken.trim(), expiresAt);
    }
  }

  public status(): MeshStatus {
    return this.storage.mesh.buildStatus(
      this.options.enabled,
      this.options.mode,
      this.options.localNodeId,
    );
  }

  public updateOptions(input: Partial<MeshRuntimeOptions>): void {
    const next: MeshRuntimeOptions = {
      ...this.options,
      ...input,
      localNodeId: input.localNodeId?.trim() || this.options.localNodeId,
      mode: input.mode ?? this.options.mode,
      enabled: input.enabled ?? this.options.enabled,
      requireMtls: input.requireMtls ?? this.options.requireMtls,
      tailnetEnabled: input.tailnetEnabled ?? this.options.tailnetEnabled,
      defaultLeaseTtlSeconds: input.defaultLeaseTtlSeconds ?? this.options.defaultLeaseTtlSeconds,
      joinToken: input.joinToken ?? this.options.joinToken,
      localNodeLabel: input.localNodeLabel ?? this.options.localNodeLabel,
      advertiseAddress: input.advertiseAddress ?? this.options.advertiseAddress,
    };
    this.options = next;
    this.init();
  }

  public join(request: MeshJoinRequest): MeshJoinResult {
    if (!this.options.enabled) {
      throw new Error("Mesh is disabled");
    }
    if (this.options.requireMtls && !request.tlsFingerprint?.trim()) {
      throw new Error("Mesh join requires tlsFingerprint");
    }

    const node = this.storage.mesh.join(request);
    return {
      accepted: true,
      node,
    };
  }

  public listNodes(limit = 200): MeshNodeRecord[] {
    return this.storage.mesh.listNodes(limit);
  }

  public acquireLease(request: MeshLeaseAcquireRequest): MeshLeaseRecord {
    return this.storage.mesh.acquireLease(
      request.leaseKey,
      request.holderNodeId,
      request.ttlSeconds ?? this.options.defaultLeaseTtlSeconds,
    );
  }

  public renewLease(request: MeshLeaseRenewRequest): MeshLeaseRecord {
    return this.storage.mesh.renewLease(
      request.leaseKey,
      request.holderNodeId,
      request.fencingToken,
      request.ttlSeconds ?? this.options.defaultLeaseTtlSeconds,
    );
  }

  public releaseLease(request: MeshLeaseReleaseRequest): { released: boolean } {
    return {
      released: this.storage.mesh.releaseLease(
        request.leaseKey,
        request.holderNodeId,
        request.fencingToken,
      ),
    };
  }

  public claimSessionOwner(sessionId: string, request: MeshSessionClaimRequest): MeshSessionOwnerRecord {
    return this.storage.mesh.claimSessionOwner(sessionId, request);
  }

  public getSessionOwner(sessionId: string): MeshSessionOwnerRecord {
    return this.storage.mesh.getSessionOwner(sessionId);
  }

  public listSessionOwners(limit = 500): MeshSessionOwnerRecord[] {
    return this.storage.mesh.listSessionOwners(limit);
  }

  public listLeases(limit = 200): MeshLeaseRecord[] {
    return this.storage.mesh.listLeases(limit);
  }

  public ingestReplicationEvent(input: MeshReplicationIngestRequest): MeshReplicationRecord {
    return this.storage.mesh.appendReplicationEvent(input);
  }

  public listReplicationEvents(limit = 200, cursor?: string): MeshReplicationRecord[] {
    return this.storage.mesh.listReplicationEvents(limit, cursor);
  }

  public setReplicationOffset(
    consumerNodeId: string,
    sourceNodeId: string,
    lastReplicationId?: string,
  ): MeshReplicationOffset {
    return this.storage.mesh.setReplicationOffset(consumerNodeId, sourceNodeId, lastReplicationId);
  }

  public listReplicationOffsets(limit = 500): MeshReplicationOffset[] {
    return this.storage.mesh.listReplicationOffsets(limit);
  }
}
