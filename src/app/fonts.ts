import {
  DM_Sans,
  IBM_Plex_Sans,
  Inter,
  Lato,
  Manrope,
  Merriweather,
  Noto_Sans,
  Poppins,
  Roboto,
  Source_Serif_4,
} from "next/font/google";

/*
 * All fonts are self-hosted at build time by next/font — no runtime requests
 * to Google. Only Inter (the UI font) and Noto Sans (the ₹ fallback) are
 * preloaded; document fonts load on demand when a design uses them.
 * `latin-ext` carries the Indian Rupee sign (U+20B9). Options must be literals
 * (next/font analyses them at build time), hence the repetition.
 */

export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
export const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-noto-sans",
  display: "swap",
});
export const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  variable: "--font-roboto",
  display: "swap",
  preload: false,
});
export const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});
export const lato = Lato({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lato",
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});
export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});
export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
});
export const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});
export const merriweather = Merriweather({
  subsets: ["latin", "latin-ext"],
  variable: "--font-merriweather",
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});
export const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif",
  display: "swap",
  preload: false,
});

export const fontVariables = [
  inter,
  notoSans,
  roboto,
  poppins,
  lato,
  ibmPlexSans,
  dmSans,
  manrope,
  merriweather,
  sourceSerif,
]
  .map((f) => f.variable)
  .join(" ");
