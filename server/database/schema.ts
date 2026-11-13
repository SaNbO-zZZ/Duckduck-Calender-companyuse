/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { bigint, index, integer, pgTable, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const calendarSubmission = pgTable("calendar_submission", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestKey: uuid("request_key").notNull().unique(),
  applicant: userProfile("applicant").notNull(),
  mentor: userProfile("mentor").notNull(),
  hr: userProfile("hr").notNull(),
  kind: varchar("kind", { length: 12 }).notNull(),
  leaveType: varchar("leave_type", { length: 30 }).notNull(),
  startMs: bigint("start_ms", { mode: 'number' }).notNull(),
  endMs: bigint("end_ms", { mode: 'number' }).notNull(),
  submittedMs: bigint("submitted_ms", { mode: 'number' }).notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  recordId: varchar("record_id", { length: 80 }),
  recordState: varchar("record_state", { length: 24 }).notNull().default('creating'),
  mentorState: varchar("mentor_state", { length: 24 }).notNull().default('pending'),
  hrState: varchar("hr_state", { length: 24 }).notNull().default('pending'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("calendar_submission_request_key_key").on(table.requestKey),
]);

// table aliases
export const calendarSubmissionTable = calendarSubmission;

export const dutyWeeklyRule = pgTable('duty_weekly_rule', {
  id: uuid('id').primaryKey().defaultRandom(), weekday: integer('weekday').notNull(), personId: userProfile('person_id').notNull(), duckKey: varchar('duck_key', { length: 40 }).notNull(), validFrom: varchar('valid_from', { length: 10 }).notNull(), validTo: varchar('valid_to', { length: 10 }), status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: customTimestamptz('_created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), createdBy: userProfile('_created_by'), updatedAt: customTimestamptz('_updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), updatedBy: userProfile('_updated_by'),
}, table => [index('duty_weekly_rule_weekday_idx').on(table.weekday)]);

export const dutyOverride = pgTable('duty_override', {
  id: uuid('id').primaryKey().defaultRandom(), dutyDate: varchar('duty_date', { length: 10 }).notNull(), originalPersonId: userProfile('original_person_id').notNull(), replacementPersonId: userProfile('replacement_person_id').notNull(), replacementDuckKey: varchar('replacement_duck_key', { length: 40 }), requestId: uuid('request_id'), status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: customTimestamptz('_created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), createdBy: userProfile('_created_by'), updatedAt: customTimestamptz('_updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), updatedBy: userProfile('_updated_by'),
}, table => [uniqueIndex('duty_override_date_active_key').on(table.dutyDate)]);

export const dutyAvatarBinding = pgTable('duty_avatar_binding', {
  id: uuid('id').primaryKey().defaultRandom(), personId: userProfile('person_id').notNull(), duckKey: varchar('duck_key', { length: 40 }).notNull(), manifestVersion: varchar('manifest_version', { length: 40 }).notNull(), status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: customTimestamptz('_created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), createdBy: userProfile('_created_by'), updatedAt: customTimestamptz('_updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), updatedBy: userProfile('_updated_by'),
}, table => [uniqueIndex('duty_avatar_binding_person_key').on(table.personId)]);

export const dutyExchangeRequest = pgTable('duty_exchange_request', {
  id: uuid('id').primaryKey().defaultRandom(), dutyDate: varchar('duty_date', { length: 10 }).notNull(), initiatorId: userProfile('initiator_id').notNull(), inviteeId: userProfile('invitee_id').notNull(), originalPersonId: userProfile('original_person_id').notNull(), replacementPersonId: userProfile('replacement_person_id').notNull(), state: varchar('state', { length: 32 }).notNull().default('draft'), expiresAt: customTimestamptz('_expires_at', { precision: 3 }).notNull(), confirmedAt: customTimestamptz('_confirmed_at', { precision: 3 }),
  createdAt: customTimestamptz('_created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), createdBy: userProfile('_created_by'), updatedAt: customTimestamptz('_updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), updatedBy: userProfile('_updated_by'),
}, table => [index('duty_exchange_request_date_idx').on(table.dutyDate)]);

export const dutyNotificationDelivery = pgTable('duty_notification_delivery', {
  id: uuid('id').primaryKey().defaultRandom(), idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(), dutyDate: varchar('duty_date', { length: 10 }).notNull(), finalPersonId: userProfile('final_person_id').notNull(), state: varchar('state', { length: 24 }).notNull().default('pending'), errorCode: varchar('error_code', { length: 120 }), attemptCount: integer('attempt_count').notNull().default(0), acceptedAt: customTimestamptz('_accepted_at', { precision: 3 }),
  createdAt: customTimestamptz('_created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), createdBy: userProfile('_created_by'), updatedAt: customTimestamptz('_updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`), updatedBy: userProfile('_updated_by'),
}, table => [uniqueIndex('duty_notification_delivery_idempotency_key').on(table.idempotencyKey)]);
