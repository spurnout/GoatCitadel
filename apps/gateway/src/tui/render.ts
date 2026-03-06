import { tuiTheme } from "./theme.js";

function border(width: number, left: string, fill: string, right: string): string {
  return `${left}${fill.repeat(Math.max(0, width - 2))}${right}`;
}

function pad(text: string, width: number): string {
  return ` ${text}${" ".repeat(Math.max(0, width - text.length - 3))} `;
}

function textWidth(lines: string[]): number {
  return Math.max(...lines.map((line) => line.length), 0) + 4;
}

export function renderBox(title: string, lines: string[], tone: "info" | "success" | "warning" | "danger" = "info"): string {
  const color = tone === "success"
    ? tuiTheme.success
    : tone === "warning"
      ? tuiTheme.warning
      : tone === "danger"
        ? tuiTheme.danger
        : tuiTheme.info;
  const titledLines = [`${title}`, ...lines];
  const width = Math.min(Math.max(textWidth(titledLines), 40), 108);
  return [
    color(border(width, "┌", "─", "┐")),
    color(`│${pad(title, width - 2)}│`),
    ...lines.map((line) => color(`│${pad(line, width - 2)}│`)),
    color(border(width, "└", "─", "┘")),
  ].join("\n");
}

export function renderSection(title: string, subtitle?: string): string {
  const lines = [tuiTheme.heading(title)];
  if (subtitle) {
    lines.push(tuiTheme.muted(subtitle));
  }
  return `${lines.join("\n")}\n${tuiTheme.dim("─".repeat(72))}`;
}

export function renderKeyValueSummary(items: Array<{ key: string; value: string }>): string {
  return items
    .map((item) => `${tuiTheme.key(item.key)} ${tuiTheme.value(item.value)}`)
    .join("\n");
}

export function renderBulletList(items: string[], tone: "muted" | "accent" = "muted"): string {
  const color = tone === "accent" ? tuiTheme.accent : tuiTheme.muted;
  return items.map((item) => color(`- ${item}`)).join("\n");
}
