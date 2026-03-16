import React from 'react';
import ReactDOM from 'react-dom/client';
import { setGlobalTheme } from '@atlaskit/tokens';
import App from './App';
import './index.css';

// Initialize Atlassian Design tokens (light theme)
setGlobalTheme({ colorMode: 'light' });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
