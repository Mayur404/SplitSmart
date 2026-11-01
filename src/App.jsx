import { useEffect } from "react";
import BootLoader from "./components/BootLoader.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import MainViewport from "./components/MainViewport.jsx";
import ToastRegion from "./components/ToastRegion.jsx";
import Dialogs from "./components/Dialogs.jsx";

export default function App() {
  useEffect(() => {
    import("./legacy/app.jsx")
      .then(() => import("./legacy/motion.jsx"))
      .catch((error) => {
        console.error("SplitSmart failed to initialize:", error);
        const app = document.getElementById("app");
        if (app) {
          app.textContent = "";
          const section = document.createElement("section");
          section.className = "panel";
          const heading = document.createElement("h2");
          heading.textContent = "Unable to start SplitSmart";
          const message = document.createElement("p");
          message.textContent = "Please refresh the page. If the problem persists, inspect the browser console.";
          section.append(heading, message);
          app.append(section);
        }
      });
  }, []);

  return (
    <>
      <BootLoader />
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Topbar />
          <MainViewport />
        </main>
      </div>
      <ToastRegion />
      <Dialogs />
    </>
  );
}
