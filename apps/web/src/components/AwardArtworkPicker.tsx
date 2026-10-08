import { useId, useState } from "react";
import { AWARD_ART, resolveAwardArt } from "../lib/award-art";

export function AwardArtworkPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const selected = AWARD_ART.find((art) => art.src === resolveAwardArt(value));
  return (
    <div className="award-art-picker">
      <button
        className="award-art-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {selected && <img src={selected.src} alt="" width="32" height="32" />}
        <span>Изображение: {selected?.title ?? (value ? "текущее" : "автоматически")}</span>
        <span aria-hidden>{open ? "-" : "+"}</span>
      </button>
      {open && (
        <div id={id} className="award-art-options" role="group" aria-label="Изображение награды">
          <button
            type="button"
            className="award-art-auto"
            aria-pressed={!value}
            onClick={() => { onChange(""); setOpen(false); }}
          >Автоматически</button>
          {AWARD_ART.map((art) => (
            <button
              type="button"
              key={art.id}
              className="award-art-option"
              aria-label={art.title}
              aria-pressed={resolveAwardArt(value) === art.src}
              onClick={() => { onChange(art.src); setOpen(false); }}
            >
              <img src={art.src} alt="" width="72" height="72" loading="lazy" />
              <span>{art.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
