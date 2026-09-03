import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import AuthenticatedApp from './AuthenticatedApp.tsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';

// Remove the HTML boot placeholder now that React is taking over the screen.
document.getElementById('boot')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthenticatedApp />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
