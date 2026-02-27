// Reusable token icon component - renders SVG icon with emoji fallback

const TOKEN_ICONS: Record<string, string> = {
  GLITCH: "/tokens/glitch.svg",
  BUDJU: "/tokens/budju.svg",
  SOL: "/tokens/sol.svg",
  USDC: "/tokens/usdc.svg",
};

const TOKEN_EMOJI_FALLBACK: Record<string, string> = {
  GLITCH: "§",
  BUDJU: "🐻",
  SOL: "◎",
  USDC: "$",
};

interface TokenIconProps {
  token: string;
  size?: number; // px, default 24
  className?: string;
}

export default function TokenIcon({ token, size = 24, className = "" }: TokenIconProps) {
  const iconPath = TOKEN_ICONS[token];

  if (iconPath) {
    return (
      <img
        src={iconPath}
        alt={token}
        width={size}
        height={size}
        className={`inline-block flex-shrink-0 ${className}`}
      />
    );
  }

  // Fallback to emoji
  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.7 }}
    >
      {TOKEN_EMOJI_FALLBACK[token] || "?"}
    </span>
  );
}
