'use client';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { FiDownload, FiShare, FiPlusSquare, FiX } from 'react-icons/fi';
import { useState } from 'react';

export default function PatientPwaBanner() {
  const { installPrompt, triggerInstall, isIOS, isStandalone } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);

  // If already installed, or user dismissed it, hide the banner entirely
  if (isStandalone || isDismissed) return null;

  // Wait until we have a valid prompt (Android) OR we detect iOS
  if (!installPrompt && !isIOS) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 max-w-md mx-auto border border-slate-700">
        
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <FiDownload className="text-xl" />
          </div>
          <div>
            <h3 className="font-black text-sm">Install DialyGo</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Get easy access to your treatment schedule.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* ANDROID / CHROME BUTTON */}
          {installPrompt && (
            <button 
              onClick={triggerInstall}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Install App
            </button>
          )}

          {/* IOS / SAFARI INSTRUCTIONS */}
          {isIOS && !installPrompt && (
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
                Tap <FiShare className="text-blue-400" /> then <FiPlusSquare className="text-blue-400" />
              </span>
            </div>
          )}

          {/* DISMISS BUTTON */}
          <button 
            onClick={() => setIsDismissed(true)}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <FiX />
          </button>
        </div>

      </div>
    </div>
  );
}