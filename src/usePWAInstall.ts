'use client';
import { useState, useEffect } from 'react';

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Check if the app is ALREADY installed (standalone mode)
    const isAppInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true;
    setIsStandalone(isAppInstalled);

    if (isAppInstalled) return;

    // 2. Intercept the standard Android/Chrome install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // Stop it from showing automatically
      setInstallPrompt(e); // Save it for our custom button
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 3. Detect iOS (Safari doesn't support automatic prompts, requires manual instructions)
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setIsIOS(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt(); // Show the native browser prompt
    
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null); // Hide our button if they accepted
    }
  };

  return { installPrompt, triggerInstall, isIOS, isStandalone };
}