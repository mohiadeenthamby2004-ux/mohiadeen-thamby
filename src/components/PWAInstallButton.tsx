import React, { useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { PWAInstallModal } from "./PWAInstallModal";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isAndroid, install } = usePWAInstall();
  const [showModal, setShowModal] = useState<boolean>(false);

  // If already installed in standalone mode, still provide an icon or hide it
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            // Direct prompt if browser is ready, or show modal
            setShowModal(true);
          } else {
            setShowModal(true);
          }
        }}
        className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer hover:border-blue-300"
        title="Install as Android App / APK"
      >
        <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span className="hidden sm:inline">Get App / APK</span>
        <span className="sm:hidden">App</span>
      </button>

      <PWAInstallModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isAndroid={isAndroid}
        onInstall={install}
      />
    </>
  );
};
