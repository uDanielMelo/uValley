const coinFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const formatCoins = (value: number): string => coinFormatter.format(Math.floor(value));

export const formatHours = (hours: number): string => {
  if (hours < 24) return `${hours} h`;
  const days = hours / 24;
  return Number.isInteger(days) ? `${days} ${days === 1 ? 'dia' : 'dias'}` : `${hours} h`;
};
