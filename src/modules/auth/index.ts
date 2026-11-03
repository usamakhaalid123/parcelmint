export { authorizePermission } from "./domain/authorization";
export type { AuthorizationDecision, StaffPrincipal } from "./domain/authorization";
export {
  permissionCatalog,
  systemRoleCatalog,
  systemRolePermissions,
} from "./domain/permission-catalog";
export type { PermissionKey, SystemRoleKey } from "./domain/permission-catalog";
export { AuthorizationDeniedError, AuthorizationReferenceNotFoundError } from "./domain/errors";
