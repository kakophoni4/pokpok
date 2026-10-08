import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { platform } from "../platform/platform";
import { Button } from "./ui";
import { ClubBrand } from "./ClubBrand";

const STORAGE_KEY = "poker-club-rules-accepted";

export function LegalNotice() {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const { pathname } = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setAgreed(false);
    if (platform.isEmbedded || pathname === "/rules") {
      setOpen(false);
      return;
    }
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    const preventCancellation = (event: Event) => event.preventDefault();
    element.addEventListener("cancel", preventCancellation);
    element.showModal();
    element.querySelector<HTMLInputElement>("input")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element.removeEventListener("cancel", preventCancellation);
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function continueToSite() {
    if (!agreed) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialog}
      className="legal-notice"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          "input:not(:disabled), a[href], button:not(:disabled)",
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="legal-notice-brand">
        <ClubBrand />
      </div>
      <h2 id={titleId}>Перед тем как продолжить</h2>
      <p id={descriptionId} className="legal-notice-copy">
        Ознакомьтесь с правилами клуба и подтвердите согласие с ними.
      </p>
      <label className="legal-notice-consent">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          Я принимаю <Link to="/rules">правила клуба</Link>
        </span>
      </label>
      <Button
        className="legal-notice-continue"
        onClick={continueToSite}
        disabled={!agreed}
      >
        Продолжить
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12h14m-5-5 5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
    </dialog>
  );
}
