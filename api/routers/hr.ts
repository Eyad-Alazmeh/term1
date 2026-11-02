import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, between, desc, eq, inArray, isNull, gte, lte, ne } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getSetting, setSetting, localDateOf, localToUtc } from "../queries/settings";
import { employees, attendance, leaves } from "../../db/schema";
import { currentQrToken, verifyQrToken, issueTicket, verifyTicket, makeCard, parseCard } from "../lib/token";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateStr = z.string().regex(DATE_RE, "صيغة التاريخ غير صحيحة");
const adminKey = z.string().min(1, "كلمة مرور الإدارة مطلوبة");

async function assertAdmin(key: string): Promise<void> {
  const real = await getSetting("admin_password");
  if (key !== real) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة مرور الإدارة غير صحيحة" });
  }
}

/** عنوان IP للمتصل كما يراه السيرفر (خلف بروكسي الاستضافة يأتي من x-forwarded-for) */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

async function allowedIps(): Promise<string[]> {
  return (await getSetting("allowed_ips"))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function verifyMode(): Promise<"wifi" | "qr" | "scan"> {
  const m = await getSetting("verify_mode");
  return m === "qr" ? "qr" : m === "wifi" ? "wifi" : "scan";
}

async function isOnSite(req: Request): Promise<boolean> {
  const ip = clientIp(req);
  return Boolean(ip) && (await allowedIps()).includes(ip);
}

async function tzOffset(): Promise<number> {
  return parseInt(await getSetting("tz_offset_min"), 10) || 0;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  while (t <= end) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

type Employee = typeof employees.$inferSelect;

/** تسجيل دخول أو خروج حسب حالة الموظف الحالية (مشترك بين التسجيل الذاتي ومسح البطاقة) */
async function recordPunch(emp: Employee, now: Date, tz: number, action?: "in" | "out") {
  const db = getDb();
  const [open] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.employeeId, emp.id), isNull(attendance.checkOut)))
    .orderBy(desc(attendance.id))
    .limit(1);

  if (action === "in" && open) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "أنت مسجّل دخول بالفعل. سجّل خروجك أولاً",
    });
  }
  if (action === "out" && !open) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "لا يوجد تسجيل دخول مفتوح. سجّل دخولك أولاً",
    });
  }

  if (open) {
    if (now.getTime() - open.checkIn.getTime() < 60_000) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "تم تسجيل دخولك قبل قليل" });
    }
    await db.update(attendance).set({ checkOut: now }).where(eq(attendance.id, open.id));
    return {
      action: "out" as const,
      employeeName: emp.name,
      time: now,
      minutes: minutesBetween(open.checkIn, now),
    };
  }

  const [last] = await db
    .select()
    .from(attendance)
    .where(eq(attendance.employeeId, emp.id))
    .orderBy(desc(attendance.id))
    .limit(1);
  if (last?.checkOut && now.getTime() - last.checkOut.getTime() < 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "تم تسجيل خروجك قبل قليل" });
  }

  await db.insert(attendance).values({
    employeeId: emp.id,
    workDate: localDateOf(now, tz),
    checkIn: now,
  });
  return { action: "in" as const, employeeName: emp.name, time: now, minutes: 0 };
}

/** تحقق الموظف في الخدمات الذاتية (إجازات): رقم وظيفي صحيح + نفس الجهاز المربوط */
async function selfServiceEmployee(code: string, deviceId: string): Promise<Employee> {
  const db = getDb();
  const [emp] = await db.select().from(employees).where(eq(employees.code, code.trim())).limit(1);
  if (!emp || !emp.active) {
    throw new TRPCError({ code: "NOT_FOUND", message: "الرقم الوظيفي غير معروف" });
  }
  if (emp.deviceId && emp.deviceId !== deviceId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذا الرقم الوظيفي مربوط بجهاز آخر. راجع الإدارة",
    });
  }
  return emp;
}

export const hrRouter = createRouter({
  // ---------- واجهة الموظف (عامة) ----------
  publicInfo: publicQuery.query(async ({ ctx }) => {
    const mode = await verifyMode();
    return {
      facilityName: await getSetting("facility_name"),
      mode,
      // في نمط الواي فاي: هل المتصل داخل شبكة المنشأة؟
      onSite: mode === "wifi" ? await isOnSite(ctx.req) : false,
    };
  }),

  // الشاشة المعلّقة عند المدخل تطلب الرمز الحالي (محمية بكلمة مرور الإدارة)
  displayToken: publicQuery
    .input(z.object({ adminKey }))
    .query(async ({ input }) => {
      await assertAdmin(input.adminKey);
      return currentQrToken();
    }),

  // الموظف يمسح الـ QR فيصل الموقع مع t؛ نتحقق منه ونعطيه تذكرة قصيرة العمر
  startSession: publicQuery
    .input(z.object({ t: z.string().min(10).max(64) }))
    .mutation(async ({ input }) => {
      if (!verifyQrToken(input.t)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الرمز منتهي أو غير صحيح. امسح الرمز الظاهر على الشاشة عند مدخل المنشأة",
        });
      }
      return { ticket: issueTicket() };
    }),

  punch: publicQuery
    .input(
      z.object({
        code: z.string().trim().min(1, "أدخل الرقم الوظيفي"),
        action: z.enum(["in", "out"]),
        ticket: z.string().max(128).optional(),
        deviceId: z.string().min(16).max(64),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const mode = await verifyMode();
      if (mode === "scan") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "التسجيل يتم بمسح بطاقتك عند مدخل المنشأة",
        });
      }
      if (mode === "qr") {
        if (!input.ticket || !verifyTicket(input.ticket)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "انتهت صلاحية الجلسة. امسح الرمز عند مدخل المنشأة من جديد",
          });
        }
      } else if (!(await isOnSite(ctx.req))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "التسجيل متاح فقط من داخل المنشأة. اتصل بشبكة الواي فاي الخاصة بها",
        });
      }
      const db = getDb();
      const now = new Date();
      const tz = await tzOffset();

      const [emp] = await db
        .select()
        .from(employees)
        .where(eq(employees.code, input.code))
        .limit(1);
      if (!emp || !emp.active) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الرقم الوظيفي غير معروف" });
      }

      // ربط الموظف بجهازه: أول مرة يُسجَّل الجهاز، وبعدها لا يُقبل غيره
      if (emp.deviceId && emp.deviceId !== input.deviceId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "هذا الرقم الوظيفي مربوط بجهاز آخر. راجع الإدارة",
        });
      }
      if (!emp.deviceId) {
        const [other] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.deviceId, input.deviceId), ne(employees.id, emp.id)))
          .limit(1);
        if (other) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "هذا الجهاز مربوط بموظف آخر. راجع الإدارة",
          });
        }
        await db.update(employees).set({ deviceId: input.deviceId }).where(eq(employees.id, emp.id));
      }

      return recordPunch(emp, now, tz, input.action);
    }),

  // ---------- مسح البطاقات (جهاز واحد عند المدخل) ----------
  employeeCards: publicQuery
    .input(z.object({ adminKey }))
    .query(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      const rows = await db
        .select()
        .from(employees)
        .where(eq(employees.active, true))
        .orderBy(employees.code);
      return rows.map((e) => ({
        code: e.code,
        name: e.name,
        department: e.department,
        card: makeCard(e.code),
      }));
    }),

  // `at` (بالميلي ثانية) يُرسل فقط للمسحات التي حُفظت أثناء انقطاع الإنترنت ثم أُرسلت لاحقاً
  scanPunch: publicQuery
    .input(
      z.object({
        adminKey,
        card: z.string().min(3).max(128),
        at: z.number().int().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const code = parseCard(input.card);
      if (!code) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "بطاقة غير صالحة" });
      }
      const db = getDb();
      const tz = await tzOffset();
      const [emp] = await db.select().from(employees).where(eq(employees.code, code)).limit(1);
      if (!emp || !emp.active) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير معروف أو موقوف" });
      }
      let now = new Date();
      if (input.at !== undefined) {
        const t = Math.min(input.at, Date.now());
        // نرفض المسحات الأقدم من 3 أيام
        if (Date.now() - t > 3 * 86_400_000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "المسح قديم جداً" });
        }
        now = new Date(t);
      }
      return recordPunch(emp, now, tz);
    }),

  // ---------- الإدارة ----------
  login: publicQuery
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await assertAdmin(input.password);
      return { ok: true };
    }),

  employeesList: publicQuery
    .input(z.object({ adminKey }))
    .query(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      const rows = await db.select().from(employees).orderBy(employees.code);
      return rows.map(({ deviceId, ...rest }) => ({ ...rest, deviceBound: Boolean(deviceId) }));
    }),

  employeeResetDevice: publicQuery
    .input(z.object({ adminKey, id: z.number() }))
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      await db.update(employees).set({ deviceId: null }).where(eq(employees.id, input.id));
      return { ok: true };
    }),

  employeeCreate: publicQuery
    .input(
      z.object({
        adminKey,
        code: z.string().trim().min(1, "الرقم الوظيفي مطلوب"),
        name: z.string().trim().min(1, "اسم الموظف مطلوب"),
        department: z.string().trim().optional(),
        dailyHours: z.number().int().min(1).max(24).default(8),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      const dup = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.code, input.code))
        .limit(1);
      if (dup.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "الرقم الوظيفي مستخدم لموظف آخر" });
      }
      await db.insert(employees).values({
        code: input.code,
        name: input.name,
        department: input.department || null,
        dailyHours: input.dailyHours,
      });
      return { ok: true };
    }),

  employeeUpdate: publicQuery
    .input(
      z.object({
        adminKey,
        id: z.number(),
        code: z.string().trim().min(1),
        name: z.string().trim().min(1),
        department: z.string().trim().optional(),
        dailyHours: z.number().int().min(1).max(24),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      await db
        .update(employees)
        .set({
          code: input.code,
          name: input.name,
          department: input.department || null,
          dailyHours: input.dailyHours,
          active: input.active,
        })
        .where(eq(employees.id, input.id));
      return { ok: true };
    }),

  employeeRemove: publicQuery
    .input(z.object({ adminKey, id: z.number() }))
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      await db.delete(attendance).where(eq(attendance.employeeId, input.id));
      await db.delete(leaves).where(eq(leaves.employeeId, input.id));
      await db.delete(employees).where(eq(employees.id, input.id));
      return { ok: true };
    }),

  attendanceList: publicQuery
    .input(
      z.object({
        adminKey,
        from: dateStr,
        to: dateStr,
        employeeId: z.number().optional(),
      }),
    )
    .query(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      const conds = [between(attendance.workDate, input.from, input.to)];
      if (input.employeeId) conds.push(eq(attendance.employeeId, input.employeeId));
      return db
        .select({
          id: attendance.id,
          employeeId: attendance.employeeId,
          workDate: attendance.workDate,
          checkIn: attendance.checkIn,
          checkOut: attendance.checkOut,
          note: attendance.note,
          employeeName: employees.name,
          employeeCode: employees.code,
        })
        .from(attendance)
        .innerJoin(employees, eq(attendance.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(attendance.workDate), desc(attendance.checkIn))
        .limit(2000);
    }),

  attendanceAdd: publicQuery
    .input(
      z.object({
        adminKey,
        employeeId: z.number(),
        workDate: dateStr,
        checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
        checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        note: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      const tz = await tzOffset();
      const checkIn = localToUtc(input.workDate, input.checkInTime, tz);
      const checkOut = input.checkOutTime
        ? localToUtc(input.workDate, input.checkOutTime, tz)
        : null;
      if (checkOut && checkOut.getTime() <= checkIn.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "وقت الخروج يجب أن يكون بعد وقت الدخول" });
      }
      await db.insert(attendance).values({
        employeeId: input.employeeId,
        workDate: input.workDate,
        checkIn,
        checkOut,
        note: input.note || null,
      });
      return { ok: true };
    }),

  attendanceUpdate: publicQuery
    .input(
      z.object({
        adminKey,
        id: z.number(),
        workDate: dateStr,
        checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
        checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        note: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      const tz = await tzOffset();
      const checkIn = localToUtc(input.workDate, input.checkInTime, tz);
      const checkOut = input.checkOutTime
        ? localToUtc(input.workDate, input.checkOutTime, tz)
        : null;
      if (checkOut && checkOut.getTime() <= checkIn.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "وقت الخروج يجب أن يكون بعد وقت الدخول" });
      }
      await db
        .update(attendance)
        .set({ checkIn, checkOut, note: input.note || null })
        .where(eq(attendance.id, input.id));
      return { ok: true };
    }),

  attendanceRemove: publicQuery
    .input(z.object({ adminKey, id: z.number() }))
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      await db.delete(attendance).where(eq(attendance.id, input.id));
      return { ok: true };
    }),

  // ---------- الإجازات ----------
  leavesList: publicQuery
    .input(z.object({ adminKey }))
    .query(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      return db
        .select({
          id: leaves.id,
          employeeId: leaves.employeeId,
          fromDate: leaves.fromDate,
          toDate: leaves.toDate,
          type: leaves.type,
          note: leaves.note,
          status: leaves.status,
          decisionNote: leaves.decisionNote,
          employeeName: employees.name,
          employeeCode: employees.code,
        })
        .from(leaves)
        .innerJoin(employees, eq(leaves.employeeId, employees.id))
        .orderBy(desc(leaves.fromDate))
        .limit(1000);
    }),

  leaveAdd: publicQuery
    .input(
      z.object({
        adminKey,
        employeeId: z.number(),
        fromDate: dateStr,
        toDate: dateStr,
        type: z.enum(["annual", "sick", "unpaid", "other"]),
        note: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      if (input.toDate < input.fromDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "تاريخ النهاية قبل تاريخ البداية" });
      }
      const db = getDb();
      await db.insert(leaves).values({
        employeeId: input.employeeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        type: input.type,
        note: input.note || null,
      });
      return { ok: true };
    }),

  // ---------- طلبات الإجازة من الموظف ----------
  leaveRequest: publicQuery
    .input(
      z.object({
        code: z.string().trim().min(1, "أدخل الرقم الوظيفي"),
        deviceId: z.string().min(16).max(64),
        fromDate: dateStr,
        toDate: dateStr,
        type: z.enum(["annual", "sick", "unpaid", "other"]),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const emp = await selfServiceEmployee(input.code, input.deviceId);
      if (input.toDate < input.fromDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "تاريخ النهاية قبل تاريخ البداية" });
      }
      const days =
        (new Date(`${input.toDate}T00:00:00Z`).getTime() -
          new Date(`${input.fromDate}T00:00:00Z`).getTime()) /
          86_400_000 +
        1;
      if (days > 90) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "مدة الإجازة أطول من 90 يوماً" });
      }
      const db = getDb();
      const [overlap] = await db
        .select({ id: leaves.id })
        .from(leaves)
        .where(
          and(
            eq(leaves.employeeId, emp.id),
            inArray(leaves.status, ["pending", "approved"]),
            lte(leaves.fromDate, input.toDate),
            gte(leaves.toDate, input.fromDate),
          ),
        )
        .limit(1);
      if (overlap) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لديك إجازة أو طلب إجازة يتداخل مع هذه الفترة",
        });
      }
      await db.insert(leaves).values({
        employeeId: emp.id,
        fromDate: input.fromDate,
        toDate: input.toDate,
        type: input.type,
        note: input.note || null,
        status: "pending",
      });
      return { ok: true };
    }),

  myLeaves: publicQuery
    .input(
      z.object({
        code: z.string().trim().min(1),
        deviceId: z.string().min(16).max(64),
      }),
    )
    .query(async ({ input }) => {
      const emp = await selfServiceEmployee(input.code, input.deviceId);
      const db = getDb();
      const rows = await db
        .select({
          id: leaves.id,
          fromDate: leaves.fromDate,
          toDate: leaves.toDate,
          type: leaves.type,
          note: leaves.note,
          status: leaves.status,
          decisionNote: leaves.decisionNote,
        })
        .from(leaves)
        .where(eq(leaves.employeeId, emp.id))
        .orderBy(desc(leaves.id))
        .limit(50);
      return { employeeName: emp.name, leaves: rows };
    }),

  leaveCancel: publicQuery
    .input(
      z.object({
        code: z.string().trim().min(1),
        deviceId: z.string().min(16).max(64),
        id: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const emp = await selfServiceEmployee(input.code, input.deviceId);
      const db = getDb();
      // يلغي فقط طلباته التي ما زالت قيد المراجعة
      await db
        .delete(leaves)
        .where(
          and(
            eq(leaves.id, input.id),
            eq(leaves.employeeId, emp.id),
            eq(leaves.status, "pending"),
          ),
        );
      return { ok: true };
    }),

  // الإدارة: قبول أو رفض طلب
  leaveSetStatus: publicQuery
    .input(
      z.object({
        adminKey,
        id: z.number(),
        status: z.enum(["approved", "rejected"]),
        decisionNote: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      await db
        .update(leaves)
        .set({ status: input.status, decisionNote: input.decisionNote || null })
        .where(eq(leaves.id, input.id));
      return { ok: true };
    }),

  leaveRemove: publicQuery
    .input(z.object({ adminKey, id: z.number() }))
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();
      await db.delete(leaves).where(eq(leaves.id, input.id));
      return { ok: true };
    }),

  // ---------- التقارير ----------
  report: publicQuery
    .input(
      z.object({
        adminKey,
        from: dateStr,
        to: dateStr,
        employeeId: z.number().optional(),
      }),
    )
    .query(async ({ input }) => {
      await assertAdmin(input.adminKey);
      const db = getDb();

      const empConds = [eq(employees.active, true)];
      if (input.employeeId) empConds.push(eq(employees.id, input.employeeId));
      const emps = await db.select().from(employees).where(and(...empConds)).orderBy(employees.code);

      const attConds = [between(attendance.workDate, input.from, input.to)];
      if (input.employeeId) attConds.push(eq(attendance.employeeId, input.employeeId));
      const attRows = await db
        .select()
        .from(attendance)
        .where(and(...attConds));

      const leaveConds = [
        lte(leaves.fromDate, input.to),
        gte(leaves.toDate, input.from),
        eq(leaves.status, "approved"),
      ];
      if (input.employeeId) leaveConds.push(eq(leaves.employeeId, input.employeeId));
      const leaveRows = await db
        .select()
        .from(leaves)
        .where(and(...leaveConds));

      return emps.map((emp) => {
        const mine = attRows.filter((a) => a.employeeId === emp.id);
        const byDate = new Map<string, typeof mine>();
        for (const row of mine) {
          const arr = byDate.get(row.workDate) ?? [];
          arr.push(row);
          byDate.set(row.workDate, arr);
        }
        const days = [...byDate.entries()]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([date, rows]) => {
            rows.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
            let minutes = 0;
            let open = false;
            for (const r of rows) {
              if (r.checkOut) minutes += minutesBetween(r.checkIn, r.checkOut);
              else open = true;
            }
            return {
              date,
              sessions: rows.length,
              minutes,
              open,
              firstIn: rows[0].checkIn,
              lastOut: rows[rows.length - 1].checkOut,
            };
          });

        const myLeaves = leaveRows.filter((l) => l.employeeId === emp.id);
        const leaveDates = new Set<string>();
        for (const l of myLeaves) {
          const f = l.fromDate > input.from ? l.fromDate : input.from;
          const t = l.toDate < input.to ? l.toDate : input.to;
          for (const d of eachDate(f, t)) leaveDates.add(d);
        }

        const totalMinutes = days.reduce((s, d) => s + d.minutes, 0);
        return {
          employee: {
            id: emp.id,
            code: emp.code,
            name: emp.name,
            department: emp.department,
            dailyHours: emp.dailyHours,
          },
          daysPresent: days.length,
          totalMinutes,
          leaveDays: leaveDates.size,
          days,
        };
      });
    }),

  // ---------- الإعدادات ----------
  settingsGet: publicQuery
    .input(z.object({ adminKey }))
    .query(async ({ input, ctx }) => {
      await assertAdmin(input.adminKey);
      return {
        verifyMode: await verifyMode(),
        allowedIps: (await getSetting("allowed_ips")),
        yourIp: clientIp(ctx.req),
        facilityName: await getSetting("facility_name"),
        tzOffsetMin: parseInt(await getSetting("tz_offset_min"), 10) || 0,
        weekStart: parseInt(await getSetting("week_start"), 10) || 0,
      };
    }),

  settingsUpdate: publicQuery
    .input(
      z.object({
        adminKey,
        facilityName: z.string().trim().min(1).optional(),
        newPassword: z.string().trim().min(4, "كلمة المرور 4 أحرف على الأقل").optional(),
        tzOffsetMin: z.number().int().min(-720).max(840).optional(),
        weekStart: z.number().int().min(0).max(6).optional(),
        verifyMode: z.enum(["wifi", "qr", "scan"]).optional(),
        allowedIps: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAdmin(input.adminKey);
      if (input.facilityName) await setSetting("facility_name", input.facilityName);
      if (input.newPassword) await setSetting("admin_password", input.newPassword);
      if (input.tzOffsetMin !== undefined) await setSetting("tz_offset_min", String(input.tzOffsetMin));
      if (input.weekStart !== undefined) await setSetting("week_start", String(input.weekStart));
      if (input.verifyMode) await setSetting("verify_mode", input.verifyMode);
      if (input.allowedIps !== undefined) {
        const cleaned = input.allowedIps.split(",").map((x) => x.trim()).filter(Boolean).join(",");
        await setSetting("allowed_ips", cleaned);
      }
      return { ok: true };
    }),
});
