import { useEffect, useRef, useState } from 'react';

/** Mounts the established advanced SplitSmart feature surface inside React.
 * The legacy feature controller is loaded only after its DOM shell is mounted.
 */
export default function App() {
  const hostRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function mountApplication() {
      try {
        const response = await fetch('/app-shell.html');
        if (!response.ok) throw new Error(`Unable to load application shell (${response.status}).`);
        const markup = await response.text();
        if (!active || !hostRef.current) return;
        hostRef.current.innerHTML = markup;
        await import('./legacy-app.js');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Application failed to start.');
      }
    }
    mountApplication();
    return () => { active = false; };
  }, []);

  return <div ref={hostRef} className="react-application">{error && <p role="alert">{error}</p>}</div>;
}
