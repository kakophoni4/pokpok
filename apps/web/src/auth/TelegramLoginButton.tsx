import { useEffect, useRef } from "react";

declare global {
  interface Window {
    onTelegramAuth?: (payload: Record<string, unknown>) => void;
  }
}

/**
 * Telegram's Login Widget renders itself from an injected script and calls a
 * global function on success — hence the window callback. The payload is signed
 * by Telegram and verified server-side before any session is issued.
 */
export function TelegramLoginButton({
  botUsername,
  onAuth,
}: {
  botUsername: string;
  onAuth: (payload: Record<string, unknown>) => void;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    window.onTelegramAuth = onAuth;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-userpic", "true");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    node.appendChild(script);

    return () => {
      node.replaceChildren();
      delete window.onTelegramAuth;
    };
  }, [botUsername, onAuth]);

  return <div ref={container} className="flex justify-center" />;
}
