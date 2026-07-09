import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import AuthenticatedApp from './AuthenticatedApp.tsx';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthenticatedApp />
    </ThemeProvider>
  </StrictMode>,
);
