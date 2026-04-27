export const BRANCHES = ["Vile Parle", "Bandra"] as const;
export type Branch = (typeof BRANCHES)[number];

export const TIME_SLOTS = [
  "11:45 AM – 1:15 PM",
  "1:15 PM – 2:45 PM",
  "2:45 PM – 4:15 PM",
  "4:15 PM – 5:45 PM",
  "5:45 PM – 7:15 PM",
  "7:00 PM – 8:30 PM",
] as const;

export const SERVICES = [
  { name: "Stick On Extension Nails", price: 499 },
  { name: "Gel Polish Hand & Toe", price: 499 },
  { name: "Soft Gel Extension Nails", price: 499 },
  { name: "Acrylic Extension Nails", price: 799 },
] as const;
