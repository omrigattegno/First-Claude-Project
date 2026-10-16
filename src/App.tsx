import { useEffect, useLayoutEffect } from 'react';
import { useGameState } from './game/store';
import { isRtl } from './i18n';
import { useNav } from './nav';
import { useWakeLock } from './hooks/useWakeLock';
import { HomeScreen } from './screens/HomeScreen';
import { HowToScreen } from './screens/HowToScreen';
import { SetupScreen } from './screens/SetupScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { GameScreen } from './screens/GameScreen';

export function App() {
  const state = useGameState();
  const { screen, reset } = useNav();
  const lang = state.settings.language;

  // Layout effect: it runs before the browser paints, so a language switch (and the first frame after
  // main.tsx's boot-time set) never shows a frame in the wrong direction.
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  // A refresh mid-round resumes straight into the game.
  useEffect(() => {
    if (state.phase !== 'setup') reset('game');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the screen on while the phone is being passed around.
  useWakeLock(screen === 'game' && state.phase !== 'setup');

  switch (screen) {
    case 'home':
      return <HomeScreen />;
    case 'howto':
      return <HowToScreen />;
    case 'setup':
      return <SetupScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'game':
      return <GameScreen />;
  }
}
