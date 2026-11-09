import { useId } from 'react';
import src from '@/assets/kode-studio.webp';
import './kode-gills.css';

// Gill regions traced on kode-studio.webp (640x566). Each stops at the hood edge,
// at the traced hood silhouette, so the hood/face is never cut or rotated;
// gill copies render behind the static masked base.
const GILLS = [
  { side: 'l', pts: '40,0 145,0 152,60 158,115 120,124 40,64', o: '158px 115px', d: 0 },
  { side: 'l', pts: '0,104 120,124 158,115 138,174 128,205 0,200', o: '138px 174px', d: 0.25 },
  { side: 'l', pts: '0,200 128,205 122,240 118,292 0,292', o: '122px 240px', d: 0.5 },
  { side: 'r', pts: '495,0 600,0 600,64 540,124 493,115 500,60', o: '493px 115px', d: 0.12 },
  { side: 'r', pts: '493,115 540,124 640,104 640,205 525,205 518,174', o: '518px 174px', d: 0.37 },
  { side: 'r', pts: '525,205 640,205 640,292 540,292 537,240', o: '537px 240px', d: 0.62 },
];

export default function KodeGills({ className, mode = 'idle' }: { className?: string; mode?: 'idle' | 'focused' | 'busy' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 640 566" className={`kode-gills kode-gills-${mode} ${className ?? ''}`} aria-hidden="true" focusable="false">
      <defs>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="566">
          <rect width="640" height="566" fill="white" />
          {GILLS.map((g, i) => <polygon key={i} points={g.pts} fill="black" />)}
        </mask>
        {GILLS.map((g, i) => <clipPath key={i} id={`${id}c${i}`}><polygon points={g.pts} /></clipPath>)}
      </defs>
      {GILLS.map((g, i) => (
        <g key={i} className="kode-gill" data-side={g.side} style={{ transformOrigin: g.o, animationDelay: `${-g.d}s` }}>
          <image href={src} width="640" height="566" clipPath={`url(#${id}c${i})`} />
        </g>
      ))}
      <image href={src} width="640" height="566" mask={`url(#${id}m)`} />
    </svg>
  );
}
