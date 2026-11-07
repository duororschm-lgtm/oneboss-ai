import type { Palette } from '../../../types/contracts';

export type ArtKind = 'chair' | 'sofa' | 'table' | 'shelf' | 'car' | 'beans' | 'abstract';
export type ArtMode = 'wood' | 'wire' | 'flat';

const WOOD = { dark: '#6f3a22', mid: '#a65f38', light: '#c98554', line: '#4c2817' };
const GROUND = 'rgba(0,0,0,0.10)';

function chair(mode: ArtMode, palette: Palette): string {
  if (mode === 'wire') {
    return `<g fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linejoin="round">
      <path d="M170 86 Q300 38 430 86 L410 252 Q300 288 190 252 Z" />
      <path d="M196 116 Q300 80 404 116 L388 232 Q300 262 212 232 Z" stroke-opacity=".55" />
      <path d="M160 252 H440 L470 302 H130 Z" />
      <path d="M158 302 L146 442 M442 302 L454 442 M196 302 L188 442 M404 302 L412 442" stroke-opacity=".8" />
      <path d="M120 300 H480" stroke-opacity=".35" />
    </g>`;
  }
  const dark = mode === 'flat' ? palette.text : WOOD.dark;
  const mid = mode === 'flat' ? palette.accent : WOOD.mid;
  const light = mode === 'flat' ? palette.surface : WOOD.light;
  return `<g>
    <ellipse cx="300" cy="444" rx="212" ry="24" fill="${GROUND}"/>
    <path d="M170 86 Q300 38 430 86 L410 252 Q300 288 190 252 Z" fill="${dark}"/>
    <path d="M196 116 Q300 80 404 116 L388 232 Q300 262 212 232 Z" fill="${light}"/>
    <path d="M160 252 H440 L470 302 H130 Z" fill="${mid}"/>
    <rect x="146" y="294" width="34" height="146" rx="12" fill="${dark}"/>
    <rect x="420" y="294" width="34" height="146" rx="12" fill="${dark}"/>
    <rect x="112" y="300" width="28" height="128" rx="10" fill="${mid}"/>
    <rect x="460" y="300" width="28" height="128" rx="10" fill="${mid}"/>
    <path d="M150 300 H450" stroke="${dark}" stroke-width="8" stroke-linecap="round" opacity=".5"/>
  </g>`;
}

function car(mode: ArtMode, palette: Palette): string {
  if (mode === 'wire') {
    return `<g fill="none" stroke="${palette.accent}" stroke-width="3.5" stroke-linejoin="round">
      <path d="M58 306 Q70 262 120 248 L205 236 Q260 176 360 176 Q452 176 500 232 L540 244 Q568 252 570 280 L566 310 Q560 322 544 322 L92 322 Q64 322 58 306 Z" />
      <path d="M220 238 Q270 194 356 194 Q424 194 470 238 Z" stroke-opacity=".6"/>
      <circle cx="180" cy="322" r="52"/><circle cx="180" cy="322" r="22" stroke-opacity=".5"/>
      <circle cx="436" cy="322" r="52"/><circle cx="436" cy="322" r="22" stroke-opacity=".5"/>
      <path d="M60 288 H540" stroke-opacity=".3"/>
    </g>`;
  }
  const body = mode === 'flat' ? palette.text : '#1f2b33';
  const window = mode === 'flat' ? palette.surface : '#b9d7de';
  const accent = mode === 'flat' ? palette.accent : '#57f0bd';
  return `<g>
    <ellipse cx="320" cy="398" rx="270" ry="18" fill="${GROUND}"/>
    <path d="M58 306 Q70 262 120 248 L205 236 Q260 176 360 176 Q452 176 500 232 L540 244 Q568 252 570 280 L566 310 Q560 322 544 322 L92 322 Q64 322 58 306 Z" fill="${body}"/>
    <path d="M220 238 Q270 194 356 194 Q424 194 470 238 Z" fill="${window}" opacity=".9"/>
    <path d="M348 200 V236" stroke="${body}" stroke-width="8"/>
    <path d="M72 286 H536" stroke="${accent}" stroke-width="5" opacity=".9"/>
    <circle cx="180" cy="322" r="54" fill="#161b1f"/>
    <circle cx="180" cy="322" r="24" fill="#c9d3d6"/>
    <circle cx="436" cy="322" r="54" fill="#161b1f"/>
    <circle cx="436" cy="322" r="24" fill="#c9d3d6"/>
    <rect x="520" y="266" width="34" height="16" rx="8" fill="${accent}"/>
  </g>`;
}

function table(mode: ArtMode, palette: Palette): string {
  if (mode === 'wire') {
    return `<g fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linejoin="round">
      <path d="M90 196 H510 L534 236 H66 Z"/>
      <path d="M120 236 L116 430 M470 236 L474 430" />
      <path d="M116 340 H474 V370 H116 Z" stroke-opacity=".7"/>
      <path d="M140 430 H96 M456 430 H500" stroke-opacity=".5"/>
    </g>`;
  }
  const dark = mode === 'flat' ? palette.text : WOOD.dark;
  const mid = mode === 'flat' ? palette.accent : WOOD.mid;
  const light = mode === 'flat' ? palette.surface : WOOD.light;
  return `<g>
    <ellipse cx="300" cy="446" rx="230" ry="20" fill="${GROUND}"/>
    <path d="M90 196 H510 L534 236 H66 Z" fill="${light}"/>
    <path d="M66 236 H534 V258 H66 Z" fill="${mid}"/>
    <rect x="108" y="258" width="30" height="180" rx="10" fill="${dark}"/>
    <rect x="462" y="258" width="30" height="180" rx="10" fill="${dark}"/>
    <path d="M114 352 H486 V382 H114 Z" fill="${mid}"/>
    <path d="M114 382 H486 V396 H114 Z" fill="${dark}" opacity=".65"/>
  </g>`;
}

function shelf(mode: ArtMode, palette: Palette): string {
  if (mode === 'wire') {
    return `<g fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linejoin="round">
      <rect x="152" y="66" width="296" height="366" rx="4"/>
      <path d="M152 186 H448 M152 306 H448"/>
      <path d="M190 120 H236 V186 M258 130 H300 V186 M330 112 H382 V186" stroke-opacity=".7"/>
      <path d="M180 320 H250 V306 M280 320 H360 V306" stroke-opacity=".7"/>
      <path d="M176 380 H420" stroke-opacity=".45"/>
    </g>`;
  }
  const dark = mode === 'flat' ? palette.text : WOOD.dark;
  const mid = mode === 'flat' ? palette.accent : WOOD.mid;
  const light = mode === 'flat' ? palette.surface : WOOD.light;
  return `<g>
    <ellipse cx="300" cy="438" rx="190" ry="18" fill="${GROUND}"/>
    <rect x="152" y="66" width="296" height="366" fill="${light}"/>
    <rect x="152" y="66" width="22" height="366" fill="${dark}"/>
    <rect x="426" y="66" width="22" height="366" fill="${dark}"/>
    <rect x="174" y="180" width="252" height="16" fill="${mid}"/>
    <rect x="174" y="300" width="252" height="16" fill="${mid}"/>
    <rect x="174" y="416" width="252" height="16" fill="${mid}"/>
    <rect x="196" y="118" width="40" height="62" fill="${dark}"/>
    <rect x="248" y="130" width="34" height="50" fill="${mid}"/>
    <rect x="330" y="110" width="52" height="70" fill="${dark}"/>
    <rect x="196" y="326" width="66" height="74" fill="${mid}"/>
    <rect x="286" y="338" width="70" height="62" fill="${dark}" opacity=".8"/>
  </g>`;
}

function beans(mode: ArtMode, palette: Palette): string {
  if (mode === 'wire') {
    return `<g fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linejoin="round">
      <path d="M206 110 H394 L414 404 H186 Z"/>
      <path d="M206 110 Q300 84 394 110" stroke-opacity=".6"/>
      <rect x="238" y="196" width="124" height="86" rx="8"/>
      <path d="M262 232 Q300 210 338 232 Q300 260 262 232 Z"/>
      <circle cx="470" cy="220" r="26"/><circle cx="500" cy="270" r="18" stroke-opacity=".7"/>
    </g>`;
  }
  const dark = mode === 'flat' ? palette.text : '#3a2418';
  const mid = mode === 'flat' ? palette.accent : '#8a5a3b';
  const light = mode === 'flat' ? palette.surface : '#e8d6bd';
  return `<g>
    <ellipse cx="300" cy="440" rx="190" ry="20" fill="${GROUND}"/>
    <path d="M206 110 H394 L414 404 H186 Z" fill="${mid}"/>
    <path d="M206 110 Q300 84 394 110 L392 152 Q300 132 208 152 Z" fill="${dark}"/>
    <path d="M186 404 H414 L404 424 H196 Z" fill="${dark}"/>
    <rect x="238" y="196" width="124" height="86" rx="8" fill="${light}"/>
    <path d="M262 232 Q300 210 338 232 Q300 260 262 232 Z" fill="${dark}"/>
    <ellipse cx="466" cy="222" rx="30" ry="20" transform="rotate(-18 466 222)" fill="${dark}"/>
    <path d="M452 214 Q470 226 480 234" stroke="${light}" stroke-width="4" fill="none"/>
    <ellipse cx="506" cy="278" rx="22" ry="15" transform="rotate(12 506 278)" fill="${mid}"/>
    <path d="M496 272 Q508 280 514 286" stroke="${light}" stroke-width="3" fill="none"/>
  </g>`;
}

function abstract(mode: ArtMode, palette: Palette): string {
  if (mode === 'wire') {
    return `<g fill="none" stroke="${palette.accent}" stroke-width="3.5">
      <circle cx="300" cy="236" r="150"/><circle cx="300" cy="236" r="92" stroke-opacity=".6"/>
      <path d="M150 386 H450 M300 86 V386 M170 120 L430 352" stroke-opacity=".45"/>
      <rect x="228" y="164" width="144" height="144" transform="rotate(18 300 236)"/>
    </g>`;
  }
  const dark = mode === 'flat' ? palette.text : '#26241f';
  const accent = mode === 'flat' ? palette.accent : '#b4552f';
  const light = mode === 'flat' ? palette.surface : '#f4f0e6';
  return `<g>
    <circle cx="300" cy="238" r="150" fill="${dark}"/>
    <path d="M300 88 A150 150 0 0 1 300 388 Z" fill="${accent}"/>
    <rect x="356" y="286" width="130" height="130" transform="rotate(16 356 286)" fill="${light}" stroke="${dark}" stroke-width="6"/>
    <circle cx="168" cy="150" r="48" fill="${accent}" opacity=".85"/>
  </g>`;
}

export function conceptArt(art: ArtKind, mode: ArtMode, palette: Palette): string {
  switch (art) {
    case 'chair':
      return chair(mode, palette);
    case 'car':
      return car(mode, palette);
    case 'table':
      return table(mode, palette);
    case 'shelf':
      return shelf(mode, palette);
    case 'beans':
      return beans(mode, palette);
    default:
      return abstract(mode, palette);
  }
}
