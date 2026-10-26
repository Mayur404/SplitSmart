import React from 'react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import FlowProgress from './FlowProgress.jsx';
import LegacyViewport from './LegacyViewport.jsx';
import Footer from './Footer.jsx';
import ToastRegion from './ToastRegion.jsx';
import Dialogs from './Dialogs.jsx';

export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Topbar />
        <FlowProgress />
        <LegacyViewport />
        <Footer />
      </main>
      <ToastRegion />
      <Dialogs />
    </div>
  );
}
