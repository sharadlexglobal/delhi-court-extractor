import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "gold" | "navy" | "success";
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = "default",
  className,
}: StatsCardProps) {
  const variantStyles = {
    default: "bg-card",
    gold: "bg-gradient-to-br from-amber-500 to-amber-600 text-white border-amber-500/20",
    navy: "bg-gradient-to-br from-slate-800 to-slate-900 text-white border-slate-700",
    success: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-500/20",
  };

  const isColoredVariant = variant !== "default";

  return (
    <Card className={cn(variantStyles[variant], className)} data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className={cn(
          "text-sm font-medium",
          isColoredVariant ? "text-white/80" : "text-muted-foreground"
        )}>
          {title}
        </CardTitle>
        <Icon className={cn(
          "h-5 w-5",
          isColoredVariant ? "text-white/70" : "text-muted-foreground"
        )} />
      </CardHeader>
      <CardContent>
        <div className={cn(
          "font-serif text-3xl font-semibold tracking-tight",
          isColoredVariant ? "text-white" : ""
        )}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {description && (
          <p className={cn(
            "mt-1 text-xs",
            isColoredVariant ? "text-white/70" : "text-muted-foreground"
          )}>
            {description}
          </p>
        )}
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            <span className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-emerald-500" : "text-red-500",
              isColoredVariant && (trend.isPositive ? "text-emerald-200" : "text-red-200")
            )}>
              {trend.isPositive ? "+" : ""}{trend.value}%
            </span>
            <span className={cn(
              "text-xs",
              isColoredVariant ? "text-white/60" : "text-muted-foreground"
            )}>
              from last week
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
