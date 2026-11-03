export const permissionCatalog = [
  { key: "admin.access", description: "Access the staff administration area" },
  { key: "staff.manage", description: "Manage staff roles and permissions" },
  { key: "catalog.manage", description: "Manage catalog content" },
  { key: "inventory.adjust", description: "Adjust inventory with an audit reason" },
  { key: "orders.manage", description: "Manage order operations" },
  {
    key: "orders.cancel_after_shipment",
    description: "Cancel an order after courier handoff",
  },
  { key: "customers.blocklist", description: "Manage operational customer blocks" },
  { key: "cash.reconcile", description: "Reconcile courier COD remittances" },
  { key: "audit.read", description: "Read administrative audit history" },
  { key: "reports.read", description: "Read operational reports" },
] as const;

export type PermissionKey = (typeof permissionCatalog)[number]["key"];

export const systemRoleCatalog = [
  { key: "owner", name: "Owner", description: "Full business administration" },
  {
    key: "administrator",
    name: "Administrator",
    description: "Full day-to-day administration",
  },
  {
    key: "product_manager",
    name: "Product Manager",
    description: "Catalog and inventory administration",
  },
  {
    key: "order_manager",
    name: "Order Manager",
    description: "Order verification and fulfillment administration",
  },
  {
    key: "warehouse_staff",
    name: "Warehouse Staff",
    description: "Packing, handoff, and stock operations",
  },
  {
    key: "customer_support",
    name: "Customer Support",
    description: "Customer and order support",
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "COD reconciliation and operational reporting",
  },
] as const;

export type SystemRoleKey = (typeof systemRoleCatalog)[number]["key"];

export const systemRolePermissions: Readonly<Record<SystemRoleKey, readonly PermissionKey[]>> = {
  owner: permissionCatalog.map((permission) => permission.key),
  administrator: permissionCatalog.map((permission) => permission.key),
  product_manager: ["admin.access", "catalog.manage", "inventory.adjust"],
  order_manager: ["admin.access", "orders.manage"],
  warehouse_staff: ["admin.access", "inventory.adjust", "orders.manage"],
  customer_support: ["admin.access", "orders.manage", "customers.blocklist"],
  accountant: ["admin.access", "cash.reconcile", "audit.read", "reports.read"],
};
