export const ROLES = {
  superAdmin: "super_admin",
  manager: "manager",
  dataEntry: "data_entry",
  warehouseStaff: "warehouse_staff",
  warehouseManager: "warehouse_manager",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_ORDER: readonly Role[] = [
  ROLES.superAdmin,
  ROLES.manager,
  ROLES.dataEntry,
  ROLES.warehouseStaff,
  ROLES.warehouseManager,
];

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
