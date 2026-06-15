// ── Role definitions ──────────────────────────────────────────────────
export type UserRole =
  | "customer"
  | "service"                    // legacy — kept for backward compat
  | "service_engineer"           // Phase 1 rename of "service"
  | "service_manager"            // assigns tickets by pincode
  | "assistant_service_manager"  // works under a service_manager, scoped to assigned pincodes
  | "dealer"                     // raises tickets on behalf of customers
  | "admin"
  | "sales"
  | "customer_support";

// Roles that can see every conversation (not just their own).
const ROLES_WITH_FULL_READ: UserRole[] = ["admin", "service"];

// Roles that can delete any conversation (not just their own).
const ROLES_WITH_FULL_DELETE: UserRole[] = ["admin"];

// Roles that may update conversation lifecycle (status, escalation).
const ROLES_WITH_LIFECYCLE: UserRole[] = ["admin", "service"];

// Roles that may submit training feedback.
const ROLES_WITH_FEEDBACK: UserRole[] = ["admin", "service"];

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if the given role may list all conversations in the system.
 * Customers only ever see their own.
 */
export function canListAllConversations(role: UserRole): boolean {
  return ROLES_WITH_FULL_READ.includes(role);
}

/**
 * Returns true if the requester may read a specific conversation.
 */
export function canAccessConversation(
  role: UserRole,
  ownerId: string,
  currentUserId: string
): boolean {
  if (ROLES_WITH_FULL_READ.includes(role)) return true;
  return ownerId === currentUserId;
}

/**
 * Returns true if the requester may delete a specific conversation.
 */
export function canDeleteConversation(
  role: UserRole,
  ownerId: string,
  currentUserId: string
): boolean {
  if (ROLES_WITH_FULL_DELETE.includes(role)) return true;
  if (role === "customer") return ownerId === currentUserId;
  // service: no delete rights
  return false;
}

/**
 * Returns true if the role may update conversation status / escalation.
 * Only service and admin may manage the lifecycle.
 */
export function canManageLifecycle(role: UserRole): boolean {
  return ROLES_WITH_LIFECYCLE.includes(role);
}

/**
 * Returns true if the role may submit training feedback corrections.
 */
export function canAddFeedback(role: UserRole): boolean {
  return ROLES_WITH_FEEDBACK.includes(role);
}
