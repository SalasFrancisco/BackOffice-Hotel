
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/interactions.css";

createRoot(document.getElementById("root")!).render(<App />);

const registerReservasPwa = async () => {
  const win = window as Window & { __INITIAL_PAGE__?: string };
  const isReservasEntry = win.__INITIAL_PAGE__ === "reservas";

  if (!isReservasEntry || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const serviceWorkerUrl = new URL("./sw.js", window.location.href);
    const serviceWorkerScope = new URL("./", window.location.href);

    await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: serviceWorkerScope.href,
    });
  } catch (error) {
    console.error("Error registering reservas service worker:", error);
  }
};

void registerReservasPwa();
  
