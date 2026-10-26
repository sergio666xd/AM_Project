"use client";

import { useEffect, useRef, useState } from "react";

type ChatViewport = { height: number; offsetTop: number; keyboardOpen: boolean };

export function useChatViewport(): ChatViewport {
  const [viewport, setViewport] = useState<ChatViewport>({ height: 0, offsetTop: 0, keyboardOpen: false });
  const availableHeight = useRef(0);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const update = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const offsetTop = visualViewport?.offsetTop ?? 0;
      const focusedElement = document.activeElement;
      const composerFocused = focusedElement instanceof HTMLElement
        && (focusedElement.matches("textarea, input") || focusedElement.isContentEditable);
      if (!composerFocused) availableHeight.current = Math.max(availableHeight.current, height);
      else if (!availableHeight.current) availableHeight.current = window.innerHeight;
      const keyboardOpen = window.innerWidth < 768 && composerFocused && availableHeight.current - height > 120;
      setViewport((current) => current.height === height && current.offsetTop === offsetTop && current.keyboardOpen === keyboardOpen
        ? current
        : { height, offsetTop, keyboardOpen });
    };

    update();
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return viewport;
}
