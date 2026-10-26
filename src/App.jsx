import React, { useEffect, useState } from 'react';
import AppShell from './legacy/components/AppShell.jsx';
import './styles/index.css';

export default function App() {
  const [startupError, setStartupError] = useState('');

  useEffect(() => {
    let active = true;
    async function startApplication() {
      try {
        await import('./controller/appController.jsx');
        await import('./advanced-motion/index.js');
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
      {startupError && (
        <div className="startup-error" role="alert">
          SplitSmart could not start: {startupError}
        </div>
      )}
    </>
  );
}
