export interface DutyAssetRole {
  assetPath: string;
  spriteSheet: string;
  actionSheets: { react: string; walkLeft: string; peek: string; jump: string };
  idleDirections: string[];
  actions: { react: string[]; walkLeft: string[]; peek: string[]; jump: string[] };
  thumbnail: string;
  staticFallback: string;
  conceptSource: string;
}
export interface DutyAssetManifest {
  manifestVersion: string;
  generatedAt: string;
  canvas: { width: number; height: number; format: string; transparent: boolean; grid: string };
  fallback: string;
  roles: Record<string, DutyAssetRole>;
}
export const weeklyDutyDuckKeys = ['caishen', 'cockroach', 'beer', 'esports', 'lion', 'racing', 'kunduck'] as const;

const assetRoot = '/assets/duty-ducks-v2';
const legacyRoleKeys: Readonly<Record<string, typeof weeklyDutyDuckKeys[number]>> = {
  mia: 'caishen',
  momo: 'cockroach',
  zhangsanbo: 'beer',
  barra: 'esports',
  ziyu: 'lion',
  jiajia: 'racing',
  billy: 'kunduck',
};

const frameNames = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(2, '0')}`);
export const dutyAssetManifest: DutyAssetManifest = {
  manifestVersion: 'duty-ducks-v2.1', generatedAt: '2026-11-13T00:00:00+08:00',
  canvas: { width: 256, height: 256, format: 'png', transparent: true, grid: '6x6' },
  fallback: `${assetRoot}/caishen/idle-00.png`,
  roles: Object.fromEntries(weeklyDutyDuckKeys.map(key => {
    const base = `${assetRoot}/${key}`;
    return [key, {
      assetPath: `${base}/idle-00.png`,
      spriteSheet: `${base}/idle-sprite-6x6.png`,
      actionSheets: {
        react: `${base}/actions/react-sheet.png`,
        walkLeft: `${base}/actions/walk-left-sheet.png`,
        peek: `${base}/actions/peek-sheet.png`,
        jump: `${base}/actions/jump-sheet.png`,
      },
      conceptSource: `assets/duty-ducks-v1/concepts/${key}-duck.png`,
      idleDirections: frameNames('idle', 36),
      actions: {
        react: frameNames('react', 2), walkLeft: frameNames('walk-left', 3),
        peek: frameNames('peek', 2), jump: frameNames('jump', 2),
      },
      thumbnail: 'idle-00', staticFallback: 'idle-00',
    }];
  })),
};

export function resolveDutyDuckKey(value: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(dutyAssetManifest.roles, value)) return value;
  if (Object.prototype.hasOwnProperty.call(legacyRoleKeys, value)) return legacyRoleKeys[value];
}
