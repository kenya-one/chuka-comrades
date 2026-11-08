import { useEffect, useState } from "react";
import "./InstallAppButton.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

function getAppUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/*
 * The browser fires `beforeinstallprompt` only once, very early in page
 * load. The button mounts only after the splash screen, so listening inside
 * the component would miss the event. We capture it here, at module load,
 * and share it with every InstallAppButton on the page.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let appInstalled = false;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((callback) => callback());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifySubscribers();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    appInstalled = true;
    notifySubscribers();
  });
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(deferredPrompt);

  const [isInstalled, setIsInstalled] = useState(appInstalled);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (standalone) {
      setIsInstalled(true);
    }

    const sync = () => {
      setInstallPrompt(deferredPrompt);
      setIsInstalled(appInstalled);
    };

    // Pick up an event that fired before this component mounted.
    sync();

    subscribers.add(sync);

    return () => {
      subscribers.delete(sync);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    const promptEvent = deferredPrompt;

    // A prompt event can only be used once.
    deferredPrompt = null;
    setInstallPrompt(null);

    try {
      // Opens the browser's native install dialog.
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;

      if (result.outcome === "accepted") {
        appInstalled = true;
        setIsInstalled(true);
        notifySubscribers();
      }
    } catch (error) {
      console.error("PWA install prompt failed:", error);
    }
  };

  /*
   * Only show the button when the browser has actually offered a
   * one-tap install (or hide it once the app is installed), so a click
   * always installs directly.
   */
  if (isInstalled || !installPrompt) {
    return null;
  }

  return (
    <div className="install-app-wrap">
      <button
        type="button"
        className="install-app-button"
        onClick={() => {
          void handleInstall();
        }}
        aria-label="Install Chuka Comrades app"
      >
        <img
          src={`${import.meta.env.BASE_URL}chukalogo-192.png`}
          alt=""
        />

        <span>Install app</span>
      </button>
    </div>
  );
}

/*
 * WhatsApp sharing button.
 * Shares the live Chuka Comrades application URL.
 */
export function WhatsAppShareButton() {
  const handleShare = () => {
    const appUrl = getAppUrl();

    const message =
      `Join me on Chuka Comrades — your campus community for ` +
      `students, hostels, marketplace, sports, study resources and more.\n\n` +
      `${appUrl}`;

    const whatsappUrl =
      `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <button
      type="button"
      className="whatsapp-share-button"
      onClick={handleShare}
      aria-label="Share Chuka Comrades on WhatsApp"
    >
      <span aria-hidden="true">◉</span>
      <span>Share on WhatsApp</span>
    </button>
  );
}