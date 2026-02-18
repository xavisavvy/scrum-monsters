import React from 'react';

interface MobileControlsProps {
  onKeyDown: (code: string) => void;
  onKeyUp: (code: string) => void;
  isActive: boolean;
}

export function MobileControls({ onKeyDown, onKeyUp, isActive }: MobileControlsProps) {
  if (!isActive) return null;

  const makeButtonHandlers = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      onKeyDown(code);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      onKeyUp(code);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      e.preventDefault();
      onKeyUp(code);
    },
  });

  const dpadButtonClass =
    'min-w-[48px] min-h-[48px] flex items-center justify-center ' +
    'bg-black/40 border-2 border-white/30 rounded-lg ' +
    'text-white font-bold text-base select-none ' +
    'active:bg-white/20';

  const actionButtonClass =
    'min-w-[56px] min-h-[56px] flex items-center justify-center ' +
    'bg-black/40 border-2 border-white/30 rounded-lg ' +
    'text-white font-jrpg text-[10px] select-none ' +
    'active:bg-white/20';

  return (
    <div
      className="absolute inset-0 pointer-events-none z-40"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Left side - D-pad */}
      <div
        className="absolute bottom-0 left-6 pointer-events-none"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex flex-col items-center gap-1 pointer-events-none">
          {/* Up */}
          <button
            className={`${dpadButtonClass} pointer-events-auto`}
            style={{ touchAction: 'none' }}
            {...makeButtonHandlers('ArrowUp')}
          >
            ▲
          </button>
          {/* Middle row: Left + Down + Right */}
          <div className="flex gap-1">
            <button
              className={`${dpadButtonClass} pointer-events-auto`}
              style={{ touchAction: 'none' }}
              {...makeButtonHandlers('ArrowLeft')}
            >
              ◄
            </button>
            <button
              className={`${dpadButtonClass} pointer-events-auto`}
              style={{ touchAction: 'none' }}
              {...makeButtonHandlers('ArrowDown')}
            >
              ▼
            </button>
            <button
              className={`${dpadButtonClass} pointer-events-auto`}
              style={{ touchAction: 'none' }}
              {...makeButtonHandlers('ArrowRight')}
            >
              ►
            </button>
          </div>
        </div>
      </div>

      {/* Right side - Action buttons */}
      <div
        className="absolute bottom-0 right-6 pointer-events-none"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex gap-2 items-end pointer-events-none">
          <button
            className={`${actionButtonClass} pointer-events-auto`}
            style={{ touchAction: 'none' }}
            {...makeButtonHandlers('ControlLeft')}
          >
            SHOOT
          </button>
          <button
            className={`${actionButtonClass} pointer-events-auto`}
            style={{ touchAction: 'none' }}
            {...makeButtonHandlers('Space')}
          >
            JUMP
          </button>
          <button
            className={`${actionButtonClass} pointer-events-auto bg-purple-900/60 border-purple-400/50 pointer-events-auto`}
            style={{ touchAction: 'none' }}
            {...makeButtonHandlers('KeyQ')}
          >
            SPECIAL
          </button>
        </div>
      </div>
    </div>
  );
}
