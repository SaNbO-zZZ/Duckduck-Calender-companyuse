import { exchangeOpenUrl } from './duty-exchange';

export interface DutyExchangeCardInput {
  title: string;
  text: string;
  requestId: string;
  baseUrl?: string;
}

/** Pure Feishu card payload; sending remains owned by the approved Miaoda capability. */
export function buildDutyExchangeOpenCard(input: DutyExchangeCardInput) {
  const url = exchangeOpenUrl(input.requestId, input.baseUrl);
  return {
    schema: '2.0',
    body: {
      elements: [
        { tag: 'div', text: { tag: 'plain_text', content: input.text } },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '打开确认页' },
          type: 'primary',
          behaviors: [{ type: 'open_url', value: { url } }],
        },
      ],
    },
    header: { title: { tag: 'plain_text', content: input.title }, template: 'blue' },
  };
}
