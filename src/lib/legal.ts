/**
 * Legal / privacy constants for the public privacy page.
 *
 * OWNER ACTION NEEDED: set the grievance/contact email for the website
 * operator, either here or with NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL at build time.
 * DPDP Act s.8(10) expects a way for people to reach the operator about the
 * personal data it does hold (hosting logs, support emails).
 */
export const PRIVACY_CONTACT_EMAIL = (process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL ?? "").trim();

/** Date the privacy page was last reviewed/changed (YYYY-MM-DD). */
export const PRIVACY_REVIEWED = "2026-11-05";

/** Dated change log shown at the bottom of the privacy page, newest first. */
export const PRIVACY_CHANGES: { date: string; summary: string }[] = [
  {
    date: "2026-11-05",
    summary:
      "Rewritten in plain language: named the host, listed everything kept in your browser, explained your role under India's DPDP Act, added security, retention, children and contact sections. Added encrypted backups, automatic folder backups and offline support.",
  },
  {
    date: "2026-10-22",
    summary: "First version of this page.",
  },
];
