import { cn } from "@/lib/utils";

const colorMap: Record<string, string> = {
  green: "bg-accent/20 text-accent",
  blue: "bg-blue/20 text-blue",
  orange: "bg-orange/20 text-orange",
  purple: "bg-purple/20 text-purple",
  red: "bg-red/20 text-red",
  cyan: "bg-cyan/20 text-cyan",
  yellow: "bg-yellow/20 text-yellow",
};

interface BadgeProps {
  text: string;
  color?: string;
  className?: string;
}

export function Badge({ text, color = "green", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
        colorMap[color] || "bg-surface text-text-muted",
        className,
      )}
    >
      {text}
    </span>
  );
}
