import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import AppContent from './components/app/AppContent';
import HooksPage from './views/HooksPage';
import HookEditorPage from './views/HookEditorPage';
import HookExecutionDetailPage from './views/HookExecutionDetailPage';
import HookExecutionsPage from './views/HookExecutionsPage';
import HookSourcePage from './views/HookSourcePage';

export default function App() {
  return (
    <I18nextProvider>
      <ThemeProvider>
        <WebSocketProvider>
          <Router
            basename={window.__ROUTER_BASENAME__ || ''}
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              <Route path="/" element={<AppContent />} />
              <Route path="/session/:sessionId" element={<AppContent />} />
              <Route path="/hooks" element={<HooksPage />} />
              <Route path="/hooks/executions" element={<HookExecutionsPage />} />
              <Route path="/hooks/executions/:hookId" element={<HookExecutionDetailPage />} />
              <Route path="/hooks/edit/:sourceKind" element={<HookEditorPage />} />
              <Route path="/hooks/sources/:sourceId" element={<HookSourcePage />} />
            </Routes>
          </Router>
        </WebSocketProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}
