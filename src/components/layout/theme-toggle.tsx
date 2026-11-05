"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

type ThemeValue = "light" | "dark" | "system";

export function ThemeSegmented({
  className,
  withLabels = false,
}: {
  className?: string;
  withLabels?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <Segmented<ThemeValue>
      size="sm"
      fullWidth
      className={className}
      aria-label="Colour theme"
      value={mounted ? ((theme as ThemeValue) ?? "system") : "system"}
      onValueChange={setTheme}
      options={[
        { value: "light", label: withLabels ? "Light" : "", icon: <Sun />, title: "Light" },
        { value: "dark", label: withLabels ? "Dark" : "", icon: <Moon />, title: "Dark" },
        { value: "system", label: withLabels ? "System" : "", icon: <Monitor />, title: "System" },
      ]}
    />
  );
}

export function ThemeIconButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Tooltip content={dark ? "Light mode" : "Dark mode"}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle colour theme"
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}
