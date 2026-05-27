import { pgTable, serial, varchar, text, boolean, numeric, timestamp, integer, date, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 用户表
export const users = pgTable(
  "users",
  {
    id: serial().primaryKey(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    password: varchar("password", { length: 255 }).notNull(),
    email: varchar("email", { length: 100 }).notNull().unique(),
    real_name: varchar("real_name", { length: 50 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("user"), // admin, pm, user
    status: varchar("status", { length: 20 }).notNull().default("active"), // active, disabled, pending
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("users_username_idx").on(table.username),
    index("users_email_idx").on(table.email),
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
  ]
);

// 项目表
export const projects = pgTable(
  "projects",
  {
    id: serial().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    owner_id: integer("owner_id").notNull().references(() => users.id),
    estimated_hours: numeric("estimated_hours", { precision: 10, scale: 1 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("in_progress"), // in_progress, completed, at_risk
    start_date: date("start_date"),
    end_date: date("end_date"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("projects_owner_id_idx").on(table.owner_id),
    index("projects_status_idx").on(table.status),
  ]
);

// 项目成员表
export const projectMembers = pgTable(
  "project_members",
  {
    id: serial().primaryKey(),
    project_id: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    user_id: integer("user_id").notNull().references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pm_project_id_idx").on(table.project_id),
    index("pm_user_id_idx").on(table.user_id),
  ]
);

// 工时记录表
export const timeEntries = pgTable(
  "time_entries",
  {
    id: serial().primaryKey(),
    user_id: integer("user_id").notNull().references(() => users.id),
    project_id: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    work_date: date("work_date").notNull(),
    hours: numeric("hours", { precision: 4, scale: 1 }).notNull(),
    remarks: text("remarks"),
    completed_work: text("completed_work"),
    coordination_matters: text("coordination_matters"),
    tomorrow_plan: text("tomorrow_plan"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("te_user_id_idx").on(table.user_id),
    index("te_project_id_idx").on(table.project_id),
    index("te_work_date_idx").on(table.work_date),
    index("te_user_project_date_idx").on(table.user_id, table.project_id, table.work_date),
  ]
);

// 系统配置表
export const systemConfigs = pgTable(
  "system_configs",
  {
    id: serial().primaryKey(),
    config_key: varchar("config_key", { length: 100 }).notNull().unique(),
    config_value: text("config_value").notNull(),
    config_type: varchar("config_type", { length: 20 }).notNull().default("string"), // boolean, string, number, json
    description: text("description"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sc_config_key_idx").on(table.config_key),
  ]
);
