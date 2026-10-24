import React, { useEffect } from 'react';
import AppShell from './components/AppShell.jsx';

export default function App() {
  useEffect(() => {
    let cancelled = false;

    async function initializeLegacyFeatures() {
      // React mounts the shell first so the compatibility controller can safely bind DOM events.
      await import('./legacy/controller.js');
      if (!cancelled) await import('./legacy/advanced-motion.js');
    }

    initializeLegacyFeatures().catch((error) => {
      console.error('SplitSmart initialization failed:', error);
      const viewport = document.getElementById('app');
      if (viewport) {
        viewport.innerHTML = '<section class="panel"><h2>Unable to start SplitSmart</h2><p>Please refresh the page. If the problem continues, check the browser console.</p></section>';
      }
    });

    return () => { cancelled = true; };
  }, []);

  return <AppShell />;
}
