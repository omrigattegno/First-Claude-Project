/**
 * Seating-order list for Setup: drag a row by its grip handle (pointer events, works with touch),
 * or use the up/down buttons (keyboard and screen-reader path), plus a remove button per row.
 * With `onRename` the name is a button: a tap swaps it for an inline input (Enter / blur commit,
 * Escape cancels) so a typo can be fixed without removing the player and losing their score.
 *
 * Drag model: on pointer down we snapshot every row's vertical midpoint; while moving, the target index
 * is "how many other rows have their midpoint above the dragged row's current centre". The dragged row
 * follows the pointer with a transform and the rows in between shift by one row pitch, so no DOM
 * reordering happens until release. The order is committed with one REORDER_PLAYERS on pointer up.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Player } from '../../game/types';
import { useT } from '../../i18n';
import { IconDown, IconGrip, IconUp, IconX } from './icons';

interface DragSession {
  pointerId: number;
  from: number;
  to: number;
  startY: number;
  /** Vertical midpoint of every row at drag start (viewport px). */
  mids: number[];
  /** Row height + gap, used to shift neighbours. */
  pitch: number;
  ids: string[];
}

interface DragView {
  from: number;
  to: number;
  dy: number;
  pitch: number;
}

export interface PlayerListProps {
  players: Player[];
  /** Freeze all controls (e.g. while a round is in progress). */
  disabled?: boolean;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  /** Tap-to-edit names. Return false to keep the editor open (the new name was rejected). */
  onRename?: (id: string, name: string) => boolean | void;
}

interface Edit {
  id: string;
  value: string;
}

function reordered(ids: readonly string[], from: number, to: number): string[] {
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function PlayerList({ players, disabled = false, onReorder, onRemove, onRename }: PlayerListProps) {
  const t = useT();
  const listRef = useRef<HTMLOListElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  // Set when the editor is closed by code (commit / Escape) so the blur that follows does not commit again.
  const closingRef = useRef(false);
  const editing = onRename && !disabled ? edit : null;

  const startEdit = (p: Player) => {
    if (!onRename || disabled || sessionRef.current) return;
    closingRef.current = false;
    setEdit({ id: p.id, value: p.name });
  };
  const closeEdit = () => {
    closingRef.current = true;
    setEdit(null);
  };
  const commitEdit = (keepOpenOnError: boolean) => {
    if (!editing || !onRename) return;
    const ok = onRename(editing.id, editing.value) !== false;
    if (ok || !keepOpenOnError) closeEdit();
  };

  const endSession = useCallback(
    (commit: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      setDrag(null);
      if (commit && s.to !== s.from) onReorder(reordered(s.ids, s.from, s.to));
    },
    [onReorder],
  );

  // Safety net when pointer capture is unavailable: a release anywhere ends the drag.
  useEffect(() => {
    if (!drag) return;
    const onUp = (ev: PointerEvent) => {
      const s = sessionRef.current;
      if (s && ev.pointerId === s.pointerId) endSession(true);
    };
    const onCancel = (ev: PointerEvent) => {
      const s = sessionRef.current;
      if (s && ev.pointerId === s.pointerId) endSession(false);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, endSession]);

  const startDrag = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || sessionRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-row]'));
    if (rows.length !== players.length) return;
    e.preventDefault();
    const rects = rows.map((r) => r.getBoundingClientRect());
    const mids = rects.map((r) => r.top + r.height / 2);
    const pitch = rects.length > 1 ? Math.abs(mids[1] - mids[0]) : rects[0].height;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; the window listeners above cover the rest */
    }
    sessionRef.current = {
      pointerId: e.pointerId,
      from: index,
      to: index,
      startY: e.clientY,
      mids,
      pitch,
      ids: players.map((p) => p.id),
    };
    setDrag({ from: index, to: index, dy: 0, pitch });
  };

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    e.preventDefault();
    const dy = e.clientY - s.startY;
    const centre = s.mids[s.from] + dy;
    let to = 0;
    for (let i = 0; i < s.mids.length; i++) if (i !== s.from && centre > s.mids[i]) to++;
    s.to = to;
    setDrag({ from: s.from, to, dy, pitch: s.pitch });
  };

  const releaseDrag = (commit: boolean) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    endSession(commit);
  };

  const rowStyle = (i: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, transition: 'none', zIndex: 2 };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return { transform: `translateY(${-drag.pitch}px)` };
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return { transform: `translateY(${drag.pitch}px)` };
    return undefined;
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= players.length || from === to) return;
    onReorder(
      reordered(
        players.map((p) => p.id),
        from,
        to,
      ),
    );
  };

  return (
    <ol className={`plist ${drag ? 'is-dragging' : ''}`.trim()} ref={listRef}>
      {players.map((p, i) => (
        <li key={p.id} data-row className={`prow ${drag?.from === i ? 'is-dragging' : ''}`.trim()} style={rowStyle(i)}>
          <button
            type="button"
            className="prow__handle"
            aria-label={t('setup.dragHandle', { name: p.name })}
            tabIndex={-1}
            disabled={disabled}
            onPointerDown={startDrag(i)}
            onPointerMove={moveDrag}
            onPointerUp={releaseDrag(true)}
            onPointerCancel={releaseDrag(false)}
            onLostPointerCapture={releaseDrag(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <IconGrip />
          </button>
          <span className="prow__seat" aria-hidden="true">
            {i + 1}
          </span>
          {editing?.id === p.id ? (
            <input
              className="input prow__edit"
              type="text"
              value={editing.value}
              aria-label={t('setup.rename', { name: p.name })}
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              enterKeyHint="done"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setEdit({ id: p.id, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit(true);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeEdit();
                }
              }}
              onBlur={() => {
                if (!closingRef.current) commitEdit(false);
              }}
            />
          ) : onRename && !disabled ? (
            <button
              type="button"
              className="prow__name prow__name--edit"
              aria-label={t('setup.rename', { name: p.name })}
              onClick={() => startEdit(p)}
            >
              {p.name}
            </button>
          ) : (
            <span className="prow__name">{p.name}</span>
          )}
          <div className="prow__actions">
            <button
              type="button"
              className="prow__btn"
              aria-label={t('setup.moveUp', { name: p.name })}
              disabled={disabled || i === 0}
              onClick={() => move(i, i - 1)}
            >
              <IconUp />
            </button>
            <button
              type="button"
              className="prow__btn"
              aria-label={t('setup.moveDown', { name: p.name })}
              disabled={disabled || i === players.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <IconDown />
            </button>
            <button
              type="button"
              className="prow__btn prow__btn--remove"
              aria-label={t('setup.remove', { name: p.name })}
              disabled={disabled}
              onClick={() => onRemove(p.id)}
            >
              <IconX />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
