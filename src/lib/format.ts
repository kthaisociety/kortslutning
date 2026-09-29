const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

/** "2026-01-15 13:34" in Stockholm time, or "—" when there is no date. */
export function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormat.format(date) : "—";
}
