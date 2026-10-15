/**
 * In-round overflow menu: a "⋯" ghost button (TopBar trailing slot or a corner) that opens an action
 * sheet with "Home" (keeps the round; Home offers "Resume round n"), "Quit this round" (ABORT_ROUND ->
 * setup, scores kept) and "End game" (END_GAME -> home, scores cleared). The destructive actions are
 * confirmed in a Modal before they run.
 */
import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { useNav } from '../nav';
import { Button } from './Button';
import { Modal } from './Modal';
import '../styles/game.css';

type Stage = 'closed' | 'menu' | 'quit' | 'end';

export function GameMenu() {
  const t = useT();
  const { dispatch } = useGame();
  const { reset } = useNav();
  const [stage, setStage] = useState<Stage>('closed');

  const close = useCallback(() => setStage('closed'), []);

  useEffect(() => {
    if (stage !== 'menu') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, close]);

  const goHome = () => {
    setStage('closed');
    reset('home');
  };

  const quitRound = () => {
    setStage('closed');
    dispatch({ type: 'ABORT_ROUND' });
    reset('setup');
  };

  const endGame = () => {
    setStage('closed');
    dispatch({ type: 'END_GAME' });
    reset('home');
  };

  return (
    <>
      <Button
        variant="ghost"
        className="game-menu__trigger"
        aria-label={t('common.menu')}
        aria-haspopup="dialog"
        aria-expanded={stage !== 'closed'}
        data-testid="game-menu"
        onClick={() => setStage('menu')}
      >
        <span aria-hidden="true">⋯</span>
      </Button>

      {stage === 'menu' && (
        <div className="sheet__backdrop" onClick={close} role="presentation">
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('common.menu')}
            onClick={(e) => e.stopPropagation()}
          >
            <Button block size="l" data-testid="game-menu-home" onClick={goHome}>
              {t('common.home')}
            </Button>
            <Button block size="l" data-testid="game-menu-quit" onClick={() => setStage('quit')}>
              {t('menu.quitRound')}
            </Button>
            <Button block size="l" variant="danger" data-testid="game-menu-end" onClick={() => setStage('end')}>
              {t('menu.endGame')}
            </Button>
            <Button block variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={stage === 'quit'}
        title={t('menu.quitRound')}
        confirmLabel={t('menu.quitRound')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={quitRound}
        onCancel={close}
      >
        {t('menu.quitRoundConfirm')}
      </Modal>

      <Modal
        open={stage === 'end'}
        title={t('menu.endGame')}
        confirmLabel={t('menu.endGame')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={endGame}
        onCancel={close}
      >
        {t('menu.endGameConfirm')}
      </Modal>
    </>
  );
}
