import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameProvider, useGameState } from './game/store';
import { NavProvider } from './nav';
import { registerPWA } from './lib/pwa';
import './styles/tokens.css';
import './styles/base.css';

registerPWA();

/** A refresh mid-round lands straight on the game screen (NavProvider reads `initial` once, at mount). */
function Root() {
  const phase = useGameState().phase;
  return (
    <NavProvider initial={phase !== 'setup' ? 'game' : 'home'}>
      <App />
    </NavProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <Root />
    </GameProvider>
  </StrictMode>,
);
