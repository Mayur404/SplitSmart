import React from 'react';
import Sidebar from '../legacy/components/Sidebar.jsx';
import Topbar from '../legacy/components/Topbar.jsx';
import LegacyViewport from '../legacy/components/LegacyViewport.jsx';
import Footer from '../legacy/components/Footer.jsx';
import ToastRegion from '../legacy/components/ToastRegion.jsx';
import Dialogs from '../legacy/components/Dialogs.jsx';

export default function AppShell() {
  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Topbar />
          <LegacyViewport />
          <Footer />
        </main>
      </div>
      <ToastRegion />
      <Dialogs />
    </>
  );
}
