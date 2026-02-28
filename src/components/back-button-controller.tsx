"use client";

import { useEffect } from "react";

import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

interface BackButtonControllerProps {
  onBack: () => void;
  visible?: boolean;
}

export function BackButtonController({ onBack, visible = true }: BackButtonControllerProps) {
  const webApp = useTelegramWebApp();

  useEffect(() => {
    if (!webApp) {
      return;
    }

    const button = webApp.BackButton;

    if (visible) {
      button.show();
    } else {
      button.hide();
    }

    button.onClick(onBack);

    return () => {
      button.offClick(onBack);
      button.hide();
    };
  }, [onBack, visible, webApp]);

  return null;
}
