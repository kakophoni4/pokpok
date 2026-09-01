import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui";

const STORAGE_KEY = "poker-club-rules-ok";

export function LegalNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="card max-w-md p-5 shadow-2xl">
        <h2 className="text-lg font-semibold">Перед входом на сайт</h2>
        <p className="mt-2 text-base leading-relaxed text-stone-300">
          Клуб спортивного покера, без денежного призового фонда. Дальше - если принимаете{" "}
          <Link to="/rules" className="text-gold-400 underline" onClick={() => setOpen(false)}>
            правила клуба
          </Link>
          .
        </p>
        <Button
          className="mt-4 w-full"
          onClick={() => {
            try {
              window.localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* private mode */
            }
            setOpen(false);
          }}
        >
          Понятно, продолжить
        </Button>
      </div>
    </div>
  );
}
