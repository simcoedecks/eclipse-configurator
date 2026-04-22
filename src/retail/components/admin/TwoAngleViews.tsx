import { useMemo } from 'react';
import PergolaVisualizer from '../../../shared/components/PergolaVisualizer';
import { COLORS } from '../../../shared/lib/colors';
import { ACCESSORIES } from '../../../shared/lib/accessories';

interface Props {
  submission: any;
}

/**
 * Renders two 3D views of the submission's pergola configuration
 * side-by-side in the admin detail modal — a 3/4 perspective and a
 * front elevation. Useful for a quick visual on the lead without
 * opening the PDF.
 */
export default function TwoAngleViews({ submission }: Props) {
  const visualizerProps = useMemo(() => {
    const cfg = submission?.configuration || {};
    const width = Number(cfg.width) || 16;
    const depth = Number(cfg.depth) || 16;
    const height = Number(cfg.height) || 9;

    // Reverse-lookup colors by the saved NAME to get the hex
    const frameColor = COLORS.find(c => c.name === cfg.frameColor)?.hex || '#0A0A0A';
    const louverColor = COLORS.find(c => c.name === cfg.louverColor)?.hex || '#F6F6F6';

    // Rebuild the Set of accessory IDs from either accessoryIds (new) or
    // accessories (legacy — names to map).
    const accIds = new Set<string>();
    if (Array.isArray(cfg.accessoryIds)) {
      cfg.accessoryIds.forEach((id: string) => accIds.add(id));
    } else if (Array.isArray(cfg.accessories)) {
      for (const name of cfg.accessories) {
        const bareName = String(name).split(' × ')[0];
        const acc = ACCESSORIES.find(a => a.name === bareName);
        if (acc) accIds.add(acc.id);
      }
    }

    return {
      width, depth, height,
      accessories: accIds,
      frameColor, louverColor,
      louverAngle: 45,
      screenDrop: 70,
      guillotineOpen: 50,
      wallColor: frameColor,
      houseWallColor: '#e2e8f0',
      houseWall: 'none' as const,
      houseWalls: new Set<'back' | 'left' | 'right' | 'front'>((cfg.houseWalls || []) as any),
      houseWallLengths: cfg.houseWallLengths || {},
      houseWallAnchors: cfg.houseWallAnchors || {},
      houseWallExtensions: cfg.houseWallExtensions || {},
      sectionChoices: cfg.sectionChoices || {},
      maxLouverSpanOverride: cfg.maxLouverSpanOverride,
      maxBaySpanOverride: cfg.maxBaySpanOverride,
      staticMode: true,
    };
  }, [submission]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
        <div className="px-2 py-1 text-[9px] uppercase tracking-widest font-bold text-gray-500 border-b border-slate-200 bg-white">
          Perspective
        </div>
        <div className="h-48">
          <PergolaVisualizer {...visualizerProps} view="perspective" />
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
        <div className="px-2 py-1 text-[9px] uppercase tracking-widest font-bold text-gray-500 border-b border-slate-200 bg-white">
          Front Elevation
        </div>
        <div className="h-48">
          <PergolaVisualizer {...visualizerProps} view="front" />
        </div>
      </div>
    </div>
  );
}
