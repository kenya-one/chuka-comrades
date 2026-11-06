import { useEffect, useState } from "react";
import { X } from "lucide-react";
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

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const checkInstalled = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      setIsInstalled(standalone);
    };

    checkInstalled();

    const appleDevice =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    setIsIOS(appleDevice);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();

      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstall,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    /*
     * Android / Chrome / Edge:
     * This directly opens the browser's native PWA
     * installation dialog.
     */
    if (installPrompt) {
      await installPrompt.prompt();

      const result = await installPrompt.userChoice;

      if (result.outcome === "accepted") {
        setIsInstalled(true);
      }

      setInstallPrompt(null);
      return;
    }

    /*
     * iPhone / iPad does not expose beforeinstallprompt.
     * The browser requires the user to use Safari's
     * Add to Home Screen flow.
     */
    if (isIOS) {
      setShowInstructions((current) => !current);
      return;
    }

    /*
     * If the browser has not supplied the install prompt yet,
     * open the application URL. The PWA remains installable
     * through the browser's native menu.
     */
    window.location.href = getAppUrl();
  };

  if (isInstalled) {
    return null;
  }

  /*
   * Keep the button visible on supported browsers and iOS.
   * This means the user can always see the Install app CTA.
   */
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
          src={`${import.meta.env.BASE_URL}chukalogo.png`}
          alt=""
        />

        <span>Install app</span>
      </button>

      {isIOS && showInstructions && (
        <div className="install-instructions">
          <button
            type="button"
            className="install-instructions-close"
            onClick={() => setShowInstructions(false)}
            aria-label="Close installation instructions"
          >
            <X size={17} />
          </button>

          <strong>Install Chuka Comrades</strong>

          <p>
            On your iPhone or iPad:
          </p>

          <ol>
            <li>Open Chuka Comrades in Safari.</li>
            <li>Tap the Safari Share button.</li>
            <li>Select <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>.</li>
          </ol>

          <small>
            The Chuka Comrades logo will appear on your Home Screen.
          </small>
        </div>
      )}
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