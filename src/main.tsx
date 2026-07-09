
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/responsive.css";
import "./styles/interactions.css";
import "./styles/dark-mode.css";
import { initializeTheme } from "./utils/theme";

initializeTheme();
createRoot(document.getElementById("root")!).render(<App />);

const registerReservasPwa = async () => {
  const win = window as Window & { __INITIAL_PAGE__?: string };
  const isReservasEntry = win.__INITIAL_PAGE__ === "reservas";

  if (!isReservasEntry || !("serviceWorker" in navigator)) {
    return;
  }

  // En desarrollo no registramos el service worker: cachea los assets (cache-first)
  // y hace que los cambios no se vean hasta un hard refresh. Además desregistramos
  // cualquiera que haya quedado instalado de sesiones previas, para que `npm run dev`
  // muestre siempre lo último. En producción la PWA sigue funcionando igual.
  if (import.meta.env.DEV) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      console.error("Error unregistering dev service worker:", error);
    }
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
  
