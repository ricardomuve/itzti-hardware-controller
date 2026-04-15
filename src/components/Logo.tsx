/**
 * Logo ItztI — SVG inline del logo del proyecto.
 * Hexágono con nodos de circuito y símbolo "Ø" estilizado en el centro.
 */

export interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 32, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ItztI logo"
    >
      {/* Hexagon frame — slightly tilted */}
      <g transform="rotate(-5, 50, 50)">
        <polygon
          points="50,5 90,25 90,75 50,95 10,75 10,25"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Circuit nodes on hexagon vertices */}
        <circle cx="10" cy="75" r="3.5" fill="currentColor" />
        <circle cx="90" cy="25" r="3.5" fill="currentColor" />
      </g>

      {/* Central circle (Ø shape) */}
      <circle
        cx="50"
        cy="50"
        r="22"
        stroke="currentColor"
        strokeWidth="4.5"
        fill="none"
      />

      {/* Diagonal slash through circle */}
      <line
        x1="33"
        y1="67"
        x2="67"
        y2="33"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Center pivot dot */}
      <circle cx="50" cy="50" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
