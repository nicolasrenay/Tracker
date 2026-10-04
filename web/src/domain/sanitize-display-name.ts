/**
 * Keeps a partner-visible name free of email addresses.
 */
export function sanitizeDisplayName(value: string): string {
  const cleaned = value.replaceAll("@", " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) {
    return "Participant";
  }
  return cleaned.slice(0, 80);
}
