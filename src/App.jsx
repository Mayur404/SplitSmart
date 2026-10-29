import React, { useEffect, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import BootLoader from './components/BootLoader.jsx';
import './styles/style.css';

export default function App() {
  const [startupError, setStartupError] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function startApplication() {
      try {
        await import('./legacy/app.jsx');
        await import('./legacy/motion.jsx');
        if (active) setIsReady(true);
      } catch (error) {
        console.error('SplitSmart initialization failed:', error);
        if (active)
          setStartupError(
            error instanceof Error ? error.message : 'Unable to initialize SplitSmart.',
          );
      }
    }
    startApplication();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <AppShell />
      {!isReady && !startupError && <BootLoader />}
      {startupError && (
        <div className="startup-error" role="alert">
          SplitSmart could not start: {startupError}
        </div>
      )}
    </>
  );
}
