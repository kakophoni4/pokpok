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
            values="0 0 0 0 .76 0 0 0 0 .65 0 0 0 0 .40 20 0 0 0 -.3"
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
