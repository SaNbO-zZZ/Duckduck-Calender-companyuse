import type { RegistrationKind, RegistrationResult } from './api.interface';

interface ReceiptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = '当前无法安全保存登记编号。请允许此网页使用本机存储，再提交登记。';

export function pendingRegistration(
  actor: string,
  kind: RegistrationKind,
  storage: () => ReceiptStorage,
) {
  const slot = 'ducky:pending-registration:' + actor + ':' + kind;
  function read(): string | null {
    let id: string | null;
    try {
      id = storage().getItem(slot);
    } catch {
      throw new Error(unavailable);
    }
    if (id !== null && !uuid.test(id)) throw new Error('已保存的登记编号异常，请联系管理员核对。');
    return id;
  }
  return {
    read,
    remember(candidate: string) {
      const existing = read();
      if (existing) return existing;
      try {
        storage().setItem(slot, candidate);
        if (storage().getItem(slot) !== candidate) throw new Error();
      } catch {
        throw new Error(unavailable);
      }
      return candidate;
    },
    clear(id: string) {
      try {
        if (read() === id) storage().removeItem(slot);
      } catch {
        // If removal fails, reopening will verify the saved receipt again.
      }
    },
  };
}

export function confirmedRegistration(result: RegistrationResult) {
  return result.recorded && !result.processing;
}
