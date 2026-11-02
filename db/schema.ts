import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
} from "drizzle-orm/mysql-core";

export const employees = mysqlTable("employees", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  // الرقم الوظيفي الذي يدخله الموظف عند المسح
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  department: varchar("department", { length: 255 }),
  // ساعات الدوام المقررة يومياً (للمقارنة في التقارير)
  dailyHours: int("daily_hours").notNull().default(8),
  active: boolean("active").notNull().default(true),
  // معرّف الجهاز المربوط بالموظف (يُربط عند أول تسجيل، والإدارة تستطيع تصفيره)
  deviceId: varchar("device_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const attendance = mysqlTable("attendance", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  employeeId: bigint("employee_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => employees.id),
  // تاريخ الدوام بصيغة YYYY-MM-DD (بحسب توقيت المنشأة)
  workDate: varchar("work_date", { length: 10 }).notNull(),
  checkIn: timestamp("check_in").notNull(),
  checkOut: timestamp("check_out"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leaves = mysqlTable("leaves", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  employeeId: bigint("employee_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => employees.id),
  fromDate: varchar("from_date", { length: 10 }).notNull(),
  toDate: varchar("to_date", { length: 10 }).notNull(),
  type: mysqlEnum("type", ["annual", "sick", "unpaid", "other"])
    .notNull()
    .default("annual"),
  note: text("note"),
  // الإجازات التي تضيفها الإدارة تُعتمد مباشرة، وطلبات الموظفين تبدأ pending
  status: mysqlEnum("status", ["pending", "approved", "rejected"])
    .notNull()
    .default("approved"),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = mysqlTable("settings", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
});
