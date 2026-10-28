const DISPLAY_TIME_ZONE = "America/Chicago";

export function formatEventWindow(startsAt: Date, endsAt: Date): string {
  const partsFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
  const startParts = Object.fromEntries(
    partsFormatter.formatToParts(startsAt).map((part) => [part.type, part.value]),
  );
  const endParts = Object.fromEntries(
    partsFormatter.formatToParts(endsAt).map((part) => [part.type, part.value]),
  );
  if (
    startParts.month === endParts.month &&
    startParts.year === endParts.year &&
    startParts.day !== endParts.day
  ) {
    return `${startParts.month} ${startParts.day}–${endParts.day}, ${startParts.year}`;
  }
  const startLabel = partsFormatter.format(startsAt);
  const endLabel = partsFormatter.format(endsAt);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}
