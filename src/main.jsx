import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Required #root element was not found.');

createRoot(rootElement).render(<App />);
