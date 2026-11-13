export interface DutyNotificationTestConfig {
  controlledRecipient: string;
  mode: 'simulate';
}

/** Read a local-only controlled recipient configuration. The ID must stay in
 * the process environment or an ignored .env.local file, never in Git. */
export function readDutyNotificationTestConfig(env: Record<string, string | undefined> = process.env): DutyNotificationTestConfig {
  const controlledRecipient = env.DUTY_TEST_RECIPIENT_ID?.trim();
  if (!controlledRecipient) throw new Error('缺少 DUTY_TEST_RECIPIENT_ID；请只在本地配置受控测试收件人。');
  if (env.DUTY_TEST_MODE !== 'simulate') throw new Error('DUTY_TEST_MODE 必须为 simulate；禁止通过该命令发送真实消息。');
  return { controlledRecipient, mode: 'simulate' };
}
