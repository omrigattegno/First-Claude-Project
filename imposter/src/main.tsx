import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameProvider } from './game/store';
import { NavProvider } from './nav';
import './styles/tokens.css';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <NavProvider>
        <App />
      </NavProvider>
    </GameProvider>
  </StrictMode>,
);
