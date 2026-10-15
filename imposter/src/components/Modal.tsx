import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';
import './Modal.css';

export interface ModalProps {
  open: boolean;
  title?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Simple confirm dialog (used for "Quit round?" / "End game?"). */
export function Modal({ open, title, children, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal__backdrop" onClick={onCancel} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="modal__title">{title}</h2>}
        {children && <div className="modal__body">{children}</div>}
        <div className="modal__actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
