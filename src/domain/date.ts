const pad = (value: number) => String(value).padStart(2, "0");

/** Formats a local calendar date without relying on browser locale data. */
export const formatDate = (date: Date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const dateAfterDays = (days: number, date: Date = new Date()) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return formatDate(result);
};
