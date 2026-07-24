export type {
  ChangeMemberRoleInput,
  InviteMemberInput,
  ProjectMember,
  TransferOwnershipInput,
} from "@/shared/contracts/membership.schema"
export type { Invitation } from "@/shared/contracts/invitation.schema"
export type { Comment, CreateCommentInput, UpdateCommentInput } from "@/shared/contracts/comment.schema"
export type { SaveVersionInput, VersionDetail, VersionMetadata } from "@/shared/contracts/version.schema"
export type { Notification } from "@/shared/contracts/notification.schema"
export type { Presence, PresenceHeartbeatInput } from "@/shared/contracts/presence.schema"
export type { FeatureLock } from "@/shared/contracts/lock.schema"

/** A single append-only project activity entry (FR-023, FR-047). */
export interface Activity {
  id: string
  projectId: string
  userId: string
  action:
    | "create"
    | "edit"
    | "delete"
    | "import"
    | "export"
    | "share"
    | "permission_change"
    | "version_restore"
  targetType: "layer" | "feature" | "member" | "version" | "comment" | "invitation"
  targetId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
