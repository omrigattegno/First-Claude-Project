import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { detectLanguage, loadSavedSettings } from './game/storage';
import { GameProvider, useGameState } from './game/store';
import { isRtl } from './i18n';
import { NavProvider } from './nav';
import { registerPWA } from './lib/pwa';
import './styles/tokens.css';
import './styles/base.css';

registerPWA();

// <html lang dir> before the first render, from the language the boot state will carry (the saved
// settings are written together with every snapshot), so a Hebrew launch never paints an LTR frame
// (index.html is lang="en" dir="ltr"). App.tsx keeps them in sync from then on.
{
  const lang = loadSavedSettings()?.language ?? detectLanguage();
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
}

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
