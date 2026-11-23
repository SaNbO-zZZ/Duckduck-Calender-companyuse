import { z } from 'zod';
import { db, HttpError } from './feishu-auth.js';
import { query } from './business-http.js';
import { Feishu } from './feishu-platform.js';

const source = 'https://alphapulse.feishu.cn/wiki/PH9ZwxfOwi1cJdksnjxcCf1Snzf';
const blockSchema = z
  .object({ block_id: z.string(), block_type: z.number(), children: z.array(z.string()).optional() })
  .passthrough();
const rich = z.object({
  elements: z.array(
    z
      .object({
        text_run: z
          .object({
            content: z.string(),
            text_element_style: z
              .object({
                bold: z.boolean().optional(),
                italic: z.boolean().optional(),
                link: z.object({ url: z.string() }).optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .passthrough(),
  ),
  style: z.object({ done: z.boolean().optional() }).optional(),
});
type Section = {
  slug: string;
  title: string;
  category: string;
  markdown_content: string;
  summary: string;
  duck_sticker_id: string;
  is_pinned: boolean;
  sort_order: number;
  version: string;
};
export function splitCharter(raw: unknown[], revision: number) {
  const blocks = raw.map((b) => blockSchema.parse(b)),
    map = new Map(blocks.map((b) => [b.block_id, b]));
  const root = blocks.find((b) => b.block_type === 1);
  if (!root?.children?.length) throw new HttpError(422, '公约正文为空。');
  const version = 'r' + String(revision).padStart(12, '0'),
    sections: Section[] = [];
  let current: Section | undefined;
  function markdown(value: unknown) {
    return rich
      .parse(value)
      .elements.map((e) => {
        if (!e.text_run) throw new HttpError(422, '公约中含尚未解析的内联内容。');
        const { content, text_element_style: s } = e.text_run;
        let t = content;
        if (s?.bold) t = '**' + t + '**';
        if (s?.italic) t = '*' + t + '*';
        if (s?.link?.url && /^https?:\/\//.test(s.link.url))
          t = '[' + t + '](' + s.link.url.replace(/\)/g, '%29') + ')';
        return t;
      })
      .join('')
      .trim();
  }
  function visit(id: string, depth: number) {
    const b = map.get(id);
    if (!b || depth > 32) throw new HttpError(422, '公约章节结构不完整。');
    const n = b.block_type,
      heading = n >= 3 && n <= 11,
      key = heading ? 'heading' + (n - 2) : { 2: 'text', 12: 'bullet', 13: 'ordered', 17: 'todo' }[n];
    if ([19, 24, 25, 32].includes(n)) {
      for (const child of b.children || []) visit(child, depth + 1);
      if (n === 19 && current) current.is_pinned = true;
      return;
    }
    if (n === 31 && current) {
      const columns = z
        .object({ property: z.object({ column_size: z.number().int().positive() }) })
        .parse(b.table).property.column_size;
      const cells = (b.children || []).map((cid) => {
        const cell = map.get(cid);
        if (cell?.block_type !== 32) throw new HttpError(422, '公约表格单元无法读取。');
        return (cell.children || [])
          .map((textId) => {
            const child = map.get(textId);
            if (child?.block_type !== 2) throw new HttpError(422, '公约表格含非文本单元。');
            return markdown(child.text);
          })
          .join('<br>')
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ');
      });
      if (!cells.length || cells.length % columns) throw new HttpError(422, '公约表格结构不完整。');
      const lines = [];
      for (let i = 0; i < cells.length; i += columns) {
        lines.push('| ' + cells.slice(i, i + columns).join(' | ') + ' |');
        if (!i) lines.push('| ' + Array(columns).fill('---').join(' | ') + ' |');
      }
      current.markdown_content += '\n\n' + lines.join('\n');
      return;
    }
    if (!key) throw new HttpError(422, '公约含暂未支持的内容块，请核对原文。');
    const data = rich.parse(b[key]);
    const line = markdown(b[key]);
    if (!current || (!depth && (heading || n === 13))) {
      const seq = sections.length + 1,
        plain = data.elements
          .map((e) => e.text_run?.content)
          .join('')
          .trim();
      const title = plain.replace(/[:：]$/, '').split(/[，。；]/)[0] || '公约正文';
      current = {
        slug: version + '-' + id,
        title,
        category: heading ? '章节' : n === 13 ? (b.children?.length ? '专项约定' : '日常约定') : '说明',
        summary: '',
        markdown_content: '',
        version,
        sort_order: seq,
        duck_sticker_id: String(((seq - 1) % 24) + 1).padStart(2, '0'),
        is_pinned: false,
      };
      sections.push(current);
    }
    if (line) {
      const prefix =
        n === 17
          ? data.style?.done
            ? '- [x] '
            : '- [ ] '
          : depth && n === 13
            ? '1. '
            : n === 12
              ? '- '
              : heading && depth
                ? '### '
                : '';
      current.markdown_content +=
        (current.markdown_content ? '\n\n' : '') + '  '.repeat(Math.max(0, depth - 1)) + prefix + line;
      if (!current.summary) current.summary = line;
    }
    for (const child of b.children || []) visit(child, depth + 1);
  }
  for (const id of root.children) visit(id, 0);
  return sections;
}
export async function chapters() {
  const [latest] = await db<{ version: string }[]>(
    query('company_charter_docs', { select: 'version', order: 'version.desc', limit: '1' }),
  );
  return latest
    ? db<Section[]>(
        query('company_charter_docs', {
          select:
            'slug,title,summary,category,markdown_content,version,is_pinned,duck_sticker_id,sort_order',
          version: 'eq.' + latest.version,
          order: 'sort_order',
        }),
      )
    : [];
}
export async function syncCharter(actor: string | null) {
  const { revision, blocks } = await new Feishu().charterSource(),
    rows = splitCharter(blocks, revision),
    old = await chapters();
  if (old[0]?.version === rows[0].version) return { version: old[0].version, count: old.length };
  const previous = new Map(old.map((s) => [s.slug.slice(14), s]));
  const upserts = rows.map((s) => {
    const prior = previous.get(s.slug.slice(14));
    return {
      ...s,
      duck_sticker_id: prior?.duck_sticker_id ?? s.duck_sticker_id,
      is_pinned: prior?.is_pinned ?? false,
      source_wiki_url: source,
      updated_by: actor,
    };
  });
  await db(
    'company_charter_docs?on_conflict=slug',
    'POST',
    upserts,
    'resolution=ignore-duplicates,return=minimal',
  );
  return { version: rows[0].version, count: rows.length };
}
