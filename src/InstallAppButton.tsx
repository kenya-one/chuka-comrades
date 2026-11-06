import { useEffect, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import './InstallAppButton.css'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)

  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    setIsInstalled(standalone)

    const appleDevice =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    setIsIOS(appleDevice)

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
      setShowInstructions(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) {
      if (isIOS) {
        setShowInstructions(!showInstructions)
      } else {
        alert(
          'To install Chuka Comrades, use your browser menu and select "Install Chuka Comrades" or "Add to Home Screen".'
        )
      }

      return
    }

    await installPrompt.prompt()

    const result = await installPrompt.userChoice

    if (result.outcome === 'accepted') {
      setIsInstalled(true)
    }

    setInstallPrompt(null)
  }

  if (isInstalled) return null

  return (
    <div className="install-app-wrap">
      <button
        className="install-app-button"
        onClick={() => void handleInstall()}
        aria-label="Install Chuka Comrades app"
      >
        <Download size={18} />
        <span>Install App</span>
      </button>

      {isIOS && showInstructions && (
        <div className="install-instructions">
          <button
            className="install-instructions-close"
            onClick={() => setShowInstructions(false)}
            aria-label="Close instructions"
          >
            <X size={17} />
          </button>

          <strong>Install Chuka Comrades</strong>

          <p>Follow these steps on your iPhone or iPad:</p>

          <ol>
            <li>Open this website in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Select Add to Home Screen.</li>
            <li>Tap Add to finish.</li>
          </ol>

          <small>
            Your Chuka Comrades logo will appear on your Home Screen.
          </small>
        </div>
      )}
    </div>
  )
}

export function WhatsAppShareButton() {
  const handleWhatsAppShare = () => {
    const shareText =
      'Join me on Chuka Comrades — your campus community platform. Connect, learn and grow together.'

    const shareUrl = window.location.href

    const whatsappUrl =
      `https://wa.me/?text=${encodeURIComponent(
        `${shareText}\n\n${shareUrl}`
      )}`

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      className="whatsapp-share-button"
      onClick={handleWhatsAppShare}
      aria-label="Share Chuka Comrades on WhatsApp"
    >
      <Share2 size={18} />
      <span>Share on WhatsApp</span>
    </button>
  )
}