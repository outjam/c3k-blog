"use client";

import { useEffect } from "react";

import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

interface MainActionButtonProps {
  text: string;
  onClick: () => void;
  visible?: boolean;
  active?: boolean;
  progress?: boolean;
}

export function MainActionButton({
  text,
  onClick,
  visible = true,
  active = true,
  progress = false,
}: MainActionButtonProps) {
  const webApp = useTelegramWebApp();

  useEffect(() => {
    if (!webApp) {
      return;
    }

    const button = webApp.MainButton;

    button.setText(text);

    if (visible) {
      button.show();
    } else {
      button.hide();
    }

    if (active) {
      button.enable();
    } else {
      button.disable();
    }

    if (progress) {
      button.showProgress(active);
    } else {
      button.hideProgress();
    }

    button.onClick(onClick);

    return () => {
      button.offClick(onClick);
      button.hideProgress();
      button.hide();
    };
  }, [active, onClick, progress, text, visible, webApp]);

  return null;
}
