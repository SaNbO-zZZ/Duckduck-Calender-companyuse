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
const base = '/spark/app/app_17fstqsqv1c/runtime/api/v1/storage/object/bucket_aadkzip6foyts/';
const remote: Record<string, { spriteSheet: string; fallback: string; actionSheets: { react: string; walkLeft: string; peek: string; jump: string }; conceptSource: string }> = {
  mia: { spriteSheet: `${base}1881716124464308.png`, fallback: `${base}1881715001649223.png`, actionSheets: { react: `${base}1881717240599716.png`, walkLeft: `${base}1881717248334947.png`, peek: `${base}1881717314739252.png`, jump: `${base}1881717248334979.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/caishen-duck.png' },
  momo: { spriteSheet: `${base}1881716129244340.png`, fallback: `${base}1881715135280195.png`, actionSheets: { react: `${base}1881717314740420.png`, walkLeft: `${base}1881717248335955.png`, peek: `${base}1881717323004931.png`, jump: `${base}1881717323004947.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/cockroach-duck.png' },
  zhangsanbo: { spriteSheet: `${base}1881716136310839.png`, fallback: `${base}1881715135282243.png`, actionSheets: { react: `${base}1881717375562771.png`, walkLeft: `${base}1881717262593095.png`, peek: `${base}1881717262593111.png`, jump: `${base}1881717262593127.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/beer-duck.png' },
  barra: { spriteSheet: `${base}1881716136312839.png`, fallback: `${base}1881714980331571.png`, actionSheets: { react: `${base}1881717375564803.png`, walkLeft: `${base}1881717262594071.png`, peek: `${base}1881717323006035.png`, jump: `${base}1881717323006051.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/esports-duck.png' },
  ziyu: { spriteSheet: `${base}1881716129246260.png`, fallback: `${base}1881715135283267.png`, actionSheets: { react: `${base}1881717323008019.png`, walkLeft: `${base}1881717262596167.png`, peek: `${base}1881717375565827.png`, jump: `${base}1881717375565843.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/lion-duck.png' },
  jiajia: { spriteSheet: `${base}1881716156003620.png`, fallback: `${base}1881714980333571.png`, actionSheets: { react: `${base}1881717393346600.png`, walkLeft: `${base}1881717379704851.png`, peek: `${base}1881717430523911.png`, jump: `${base}1881717393347688.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/racing-duck.png' },
  billy: { spriteSheet: `${base}1881716179004488.png`, fallback: `${base}1881715126187108.png`, actionSheets: { react: `${base}1881717430523927.png`, walkLeft: `${base}1881717379704867.png`, peek: `${base}1881717525359639.png`, jump: `${base}1881717430523943.png` }, conceptSource: 'assets/duty-ducks-v1/concepts/kunduck.png' },
};
const frameNames = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(2, '0')}`);
export const dutyAssetManifest: DutyAssetManifest = {
  manifestVersion: 'duty-ducks-v2.1', generatedAt: '2026-11-13T00:00:00+08:00',
  canvas: { width: 256, height: 256, format: 'png', transparent: true, grid: '6x6' }, fallback: 'static/duck-fallback.png',
  roles: Object.fromEntries(Object.entries(remote).map(([role, asset]) => [role, {
    assetPath: asset.fallback, spriteSheet: asset.spriteSheet, actionSheets: asset.actionSheets, conceptSource: asset.conceptSource, idleDirections: frameNames('idle', 36),
    actions: { react: ['react-00', 'react-01'], walkLeft: ['walk-left-00', 'walk-left-01', 'walk-left-02'], peek: ['peek-00', 'peek-01'], jump: ['jump-00', 'jump-01'] },
    thumbnail: 'idle-09', staticFallback: 'idle-00',
  }])) as Record<string, DutyAssetRole>,
};
