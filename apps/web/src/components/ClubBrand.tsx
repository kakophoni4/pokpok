import { useId } from "react";

export function ClubBrand() {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="concept-wordmark"
      viewBox="136 287 370 54"
      role="img"
      aria-label="CONCEPT"
    >
      <defs>
        <filter id={`brand${id}`} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 .80 0 0 0 0 .70 0 0 0 0 .47 1.55 0 0 0 -.047"
          />
        </filter>
      </defs>
      <image
        href="/images/concept-original.png"
        width="640"
        height="640"
        filter={`url(#brand${id})`}
      />
    </svg>
  );
}
