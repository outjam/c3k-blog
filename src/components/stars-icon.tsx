import type { SVGProps } from "react";

export function StarsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="m12 2.75 1.92 4.31 4.68.47-3.5 3.08 1 4.59L12 12.88 7.9 15.2l1-4.59-3.49-3.08 4.67-.47L12 2.75Z"
        fill="currentColor"
      />
      <path
        d="m18.42 2.5.77 1.72 1.88.19-1.41 1.24.41 1.84-1.65-.94-1.65.94.41-1.84-1.41-1.24 1.88-.19.77-1.72Z"
        fill="currentColor"
        opacity=".7"
      />
    </svg>
  );
}
