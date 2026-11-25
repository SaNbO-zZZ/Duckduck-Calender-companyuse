import {
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Outfit } from './duck-wardrobe';

// Local axes face the viewer (+Z). Each moving joint owns all of its accessories.
export function toyKit() {
  const sphere = new SphereGeometry(1, 24, 16),
    box = new BoxGeometry(2, 2, 2);
  const cylinder = new CylinderGeometry(1, 1, 2, 24),
    cone = new CylinderGeometry(0.06, 1, 2, 24);
  const dome = new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const ring = new TorusGeometry(1, 0.15, 8, 24);
  const materials = new Map<string, Material>();
  const cream = '#ffdc70',
    bill = '#f49841',
    pink = '#f3a094',
    ink = '#302c3b',
    white = '#fff4d9';
  const sea = '#5eac9c',
    red = '#bc5752',
    navy = '#354e69',
    honey = '#ecb346';
  function mat(color: string) {
    if (!materials.has(color))
      materials.set(
        color,
        color === cream
          ? new MeshPhysicalMaterial({
              color,
              roughness: 0.32,
              clearcoat: 0.25,
              clearcoatRoughness: 0.42,
            })
          : new MeshStandardMaterial({
              color,
              roughness: color === ink ? 0.21 : 0.55,
              transparent: color === '#ffdb67',
              opacity: color === '#ffdb67' ? 0.86 : 1,
            }),
      );
    return materials.get(color)!;
  }
  function part(
    g: Group,
    geo: BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
  ) {
    const m = new Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.scale.set(a, b, c);
    g.add(m);
    return m;
  }
  const orb = (
    g: Group,
    color: string,
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
  ) => part(g, sphere, color, x, y, z, a, b, c);
  function joint(parent: Group, x = 0, y = 0, z = 0) {
    const g = new Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  function rod(
    g: Group,
    color: string,
    from: number[],
    to: number[],
    width: number,
  ) {
    const a = new Vector3(...from),
      b = new Vector3(...to),
      delta = b.clone().sub(a);
    const p = part(
      g,
      cylinder,
      color,
      0,
      0,
      0,
      width,
      delta.length() / 2,
      width,
    );
    p.position.copy(a.add(b).multiplyScalar(0.5));
    p.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
    return p;
  }
  function make(look: Outfit) {
    const root = new Group(),
      body = joint(root),
      head = joint(body, 0, 1.05, 0);
    orb(body, cream, 0, 0.58, 0, 0.61, 0.53, 0.48);
    orb(body, '#ffe7a1', 0, 0.56, 0.32, 0.39, 0.35, 0.19);
    orb(body, cream, 0, 0.57, -0.42, 0.22, 0.19, 0.28).rotation.x = -0.55;
    orb(head, cream, 0, 0.13, 0.05, 0.64, 0.56, 0.51);
    const eyes = joint(head, 0, 0.23, 0.51),
      beak = joint(head, 0, 0.03, 0.53);
    for (const s of [-1, 1]) {
      orb(eyes, ink, s * 0.258, 0, 0, 0.083, 0.1, 0.061);
      orb(eyes, white, s * 0.258 - 0.018, 0.036, 0.054, 0.025, 0.026, 0.014);
      orb(head, pink, s * 0.4, -0.012, 0.448, 0.105, 0.053, 0.029).rotation.y =
        s * 0.52;
    }
    orb(beak, '#cc6933', 0, -0.046, 0, 0.195, 0.054, 0.136);
    orb(beak, bill, 0, 0.01, 0.022, 0.255, 0.077, 0.177);
    orb(head, cream, -0.074, 0.67, 0, 0.085, 0.13, 0.075).rotation.z = 0.62;
    const wings = [-1, 1].map((s) => {
      const w = joint(body, s * 0.475, 0.75, 0.02);
      orb(w, cream, s * 0.055, -0.11, 0.11, 0.17, 0.29, 0.21).rotation.z =
        s * 0.2;
      return w;
    });
    const feet = [-1, 1].map((s) => {
      const f = joint(root, s * 0.265, 0.115, 0.14);
      orb(f, bill, 0, 0, 0, 0.225, 0.102, 0.26);
      return f;
    });
    const hat = joint(head, 0, 0.51, 0.02),
      prop = joint(body, 0.46, 0.61, 0.32);
    const cloth = joint(body, 0, 0.91, 0),
      glasses = joint(head);
    const plume = joint(prop),
      page = joint(prop, 0, 0.05, 0.17);
    function cap(color: string, pom = false) {
      part(hat, dome, color, 0, 0, 0, 0.55, 0.37, 0.49);
      orb(hat, color, 0, 0.015, 0.015, 0.58, 0.093, 0.515);
      if (pom) orb(hat, white, 0, 0.39, -0.015, 0.128, 0.125, 0.125);
    }
    function scarf(color: string) {
      orb(body, color, 0, 0.94, 0.02, 0.49, 0.115, 0.445);
      part(
        cloth,
        box,
        color,
        -0.43,
        -0.15,
        0.11,
        0.09,
        0.25,
        0.044,
      ).rotation.z = -0.53;
    }
    function mug(color: string) {
      part(prop, cylinder, color, 0, 0.04, 0.08, 0.17, 0.185, 0.16);
      orb(prop, '#694b40', 0, 0.23, 0.08, 0.154, 0.017, 0.148);
      part(prop, ring, color, 0.17, 0.07, 0.07, 0.106, 0.1, 0.1);
      orb(prop, white, -0.04, 0.235, 0.12, 0.053, 0.012, 0.048);
    }
    switch (look) {
      case 'shades':
      case 'aviator':
        for (const s of [-1, 1]) {
          orb(
            glasses,
            look === 'shades' ? ink : honey,
            s * 0.26,
            0.23,
            0.49,
            0.225,
            0.16,
            0.08,
          );
          orb(glasses, navy, s * 0.26, 0.23, 0.55, 0.165, 0.11, 0.04);
          rod(
            glasses,
            white,
            [s * 0.26 - 0.055, 0.245, 0.588],
            [s * 0.26 + 0.015, 0.29, 0.589],
            0.012,
          );
        }
        rod(glasses, ink, [-0.12, 0.24, 0.52], [0.12, 0.24, 0.52], 0.03);
        if (look === 'aviator') scarf(red);
        break;
      case 'straw':
      case 'beret':
      case 'pumpkin':
        if (look === 'straw') {
          orb(hat, honey, 0, 0.025, 0, 0.77, 0.065, 0.59);
          cap(honey);
          orb(hat, red, 0, 0.1, 0, 0.54, 0.053, 0.48);
        } else if (look === 'beret') {
          cap(sea);
          hat.rotation.z = -0.28;
          orb(hat, navy, 0, 0.33, 0, 0.06, 0.09, 0.05);
        } else {
          orb(hat, '#e98837', 0, 0.1, 0, 0.52, 0.25, 0.43);
          rod(hat, sea, [0, 0.3, 0], [0.06, 0.48, 0], 0.055);
        }
        if (look === 'straw') {
          part(prop, cylinder, sea, 0, 0, 0, 0.19, 0.14, 0.16);
          rod(prop, sea, [0.09, -0.03, 0], [0.34, 0.17, 0.02], 0.055);
          part(prop, ring, sea, -0.2, 0.065, 0, 0.095, 0.105, 0.08);
        }
        break;
      case 'coffee':
      case 'cocoa':
      case 'lemonade':
        mug(look === 'coffee' ? sea : look === 'cocoa' ? red : '#efa154');
        if (look === 'lemonade') {
          rod(prop, sea, [0, 0.21, 0.08], [0.06, 0.47, 0.08], 0.023);
          orb(prop, honey, -0.14, 0.26, 0.07, 0.09, 0.09, 0.025);
        }
        if (look === 'cocoa') scarf(sea);
        if (look !== 'lemonade')
          for (let j = 0; j < 2; j++)
            orb(
              plume,
              white,
              j * 0.095 - 0.06,
              0.32 + j * 0.11,
              0.09,
              0.038,
              0.065,
              0.027,
            );

        break;
      case 'book':
        for (const s of [-1, 1]) {
          const page = part(
            prop,
            box,
            navy,
            s * 0.15,
            0.06,
            0.12,
            0.17,
            0.22,
            0.035,
          );
          page.rotation.y = s * 0.35;
          part(
            prop,
            box,
            white,
            s * 0.15,
            0.065,
            0.081,
            0.15,
            0.2,
            0.02,
          ).rotation.y = s * 0.35;
        }
        for (let i = 0; i < 3; i++)
          part(
            prop,
            box,
            honey,
            -0.16,
            0.13 - i * 0.056,
            0.166,
            0.087 - i * 0.012,
            0.009,
            0.007,
          ).rotation.y = -0.35;
        part(prop, box, red, 0.19, -0.12, 0.164, 0.028, 0.088, 0.009);
        part(page, box, '#f6dfaf', 0.11, 0, 0, 0.105, 0.162, 0.012);
        prop.position.set(0.03, 0.58, 0.55);
        break;
      case 'camera':
        part(prop, box, navy, 0, 0.02, 0.12, 0.25, 0.16, 0.13);
        orb(prop, ink, 0, 0.01, 0.25, 0.125, 0.13, 0.07);
        orb(prop, '#76abbd', 0, 0.015, 0.31, 0.07, 0.075, 0.028);
        part(prop, box, white, 0.15, 0.12, 0.26, 0.045, 0.032, 0.012);
        prop.position.x = 0.12;
        break;
      case 'fishing':
        rod(prop, '#916440', [0, -0.1, 0], [0.67, 1.15, -0.14], 0.027);
        rod(prop, white, [0.67, 1.15, -0.14], [0.81, 0.17, -0.14], 0.011);
        orb(prop, red, 0.81, 0.12, -0.14, 0.052, 0.09, 0.052);
        part(root, box, '#a67850', 0, 0.3, -0.2, 0.47, 0.055, 0.35);
        for (const side of [-1, 1])
          rod(
            root,
            '#865a40',
            [side * 0.41, 0.28, -0.18],
            [side * 0.46, 0.02, -0.12],
            0.046,
          );
        break;
      case 'umbrella':
      case 'leaf':
        rod(prop, navy, [0, -0.15, 0], [-0.13, 1.34, 0], 0.027);
        if (look === 'umbrella') {
          part(prop, dome, '#ffdb67', -0.13, 1.12, 0, 0.72, 0.28, 0.62);
          orb(prop, bill, -0.13, 1.42, 0, 0.045, 0.05, 0.045);
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            orb(
              prop,
              honey,
              -0.13 + 0.7 * Math.cos(a),
              1.12,
              0.6 * Math.sin(a),
              0.024,
              0.031,
              0.024,
            );
          }
        } else {
          orb(prop, sea, -0.16, 1.19, 0, 0.68, 0.12, 0.4).rotation.z = 0.16;
          rod(prop, '#b6d48d', [-0.69, 1.12, 0.23], [0.35, 1.28, 0.23], 0.023);
        }
        break;
      case 'slicker':
        part(body, cone, sea, 0, 0.58, 0, 0.65, 0.38, 0.52);
        orb(head, sea, 0, 0.1, -0.09, 0.68, 0.61, 0.46);
        orb(hat, sea, 0, 0.03, 0.1, 0.72, 0.085, 0.58);
        for (const y of [0.46, 0.62, 0.78])
          orb(body, honey, 0, y, 0.46, 0.038, 0.04, 0.025);
        break;
      case 'warmer':
        orb(prop, '#ce8277', 0, 0.09, 0.1, 0.25, 0.25, 0.105);
        part(prop, cylinder, white, 0, 0.34, 0.1, 0.089, 0.05, 0.064);
        prop.position.set(0, 0.52, 0.48);
        break;
      case 'brace':
        scarf(sea);
        break;
      case 'catchSnow':
        scarf(red);
        orb(prop, '#f5fcff', 0, 0.24, 0.04, 0.069, 0.069, 0.069);
        prop.position.set(0.53, 0.78, 0.22);
        break;
      case 'wave':
      case 'gaze':
        break;
      case 'beanie':
        cap(red, true);
        scarf(sea);
        break;
      case 'scarf':
        scarf(red);
        break;
      case 'snowman':
        prop.position.set(0.78, 0.22, 0.05);
        orb(prop, white, 0, 0.04, 0, 0.29, 0.28, 0.25);
        orb(prop, white, 0, 0.41, 0, 0.225, 0.22, 0.21);
        for (const s of [-1, 1])
          orb(prop, ink, s * 0.083, 0.44, 0.175, 0.026, 0.032, 0.02);
        orb(prop, bill, 0, 0.39, 0.21, 0.044, 0.034, 0.083);
        part(prop, cylinder, navy, 0, 0.64, 0, 0.155, 0.08, 0.15);
        break;
      case 'nightcap':
        part(
          hat,
          cone,
          '#8996cb',
          0.025,
          0.21,
          0,
          0.54,
          0.33,
          0.45,
        ).rotation.z = -0.33;
        orb(hat, white, 0, 0.015, 0.02, 0.55, 0.08, 0.48);
        orb(hat, white, 0.14, 0.53, 0, 0.105, 0.105, 0.105);
        break;
      case 'telescope':
        rod(prop, honey, [-0.08, 0.33, 0.1], [0.55, 0.66, 0.08], 0.11);
        rod(prop, navy, [0.42, 0.6, 0.08], [0.58, 0.68, 0.08], 0.15);
        for (const s of [-1, 1])
          rod(
            prop,
            navy,
            [0.13, 0.41, 0.1],
            [0.13 + s * 0.22, -0.53, 0.1],
            0.025,
          );
        break;
      case 'lantern':
        part(prop, cylinder, navy, 0, -0.12, 0.09, 0.2, 0.045, 0.18);
        orb(prop, '#ffd38a', 0, 0.08, 0.09, 0.175, 0.2, 0.16);
        part(prop, cone, navy, 0, 0.3, 0.09, 0.2, 0.065, 0.18);
        part(prop, ring, navy, 0, 0.42, 0.09, 0.108, 0.12, 0.1);
        break;
    }
    return {
      root,
      body,
      head,
      eyes,
      beak,
      wings,
      feet,
      hat,
      prop,
      cloth,
      glasses,
      plume,
      page,
      look,
    };
  }
  return {
    make,
    dispose() {
      [sphere, box, cylinder, cone, dome, ring].forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
export type Duck = ReturnType<ReturnType<typeof toyKit>['make']>;
