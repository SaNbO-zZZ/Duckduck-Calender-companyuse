const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const candidates = [
  path.join(__dirname, '../deployment/duck-calendar-runtime/client/src/pages/Calendar/calendar-document.ts'),
  path.join(__dirname, '../client/src/pages/Calendar/calendar-document.ts'),
];
const generated = candidates.find(fs.existsSync);
if (!generated) throw new Error('Exported calendar document is missing');
const source = fs.readFileSync(generated, 'utf8');
const encoded = source.match(/export const calendarDocument = ("(?:\\.|[^"\\])*");/s)?.[1];
if (!encoded) throw new Error('Exported calendar document is missing');
const html = JSON.parse(encoded).replace('/*__DUCK_SPRITE_DATA__*/', '{}');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter((match) => !match[1].includes('type='))
  .map((match) => match[2]);
if (scripts.length < 2) throw new Error('Expected runtime scripts were not exported');
scripts.forEach((script, index) => new vm.Script(script, { filename: `calendar-inline-${index}.js` }));
console.log(`Exported calendar scripts parse: ${scripts.length}`);
