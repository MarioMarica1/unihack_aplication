const lineColors: Record<string, string> = {
  E1: '#2563eb', E2: '#059669', E3: '#d97706', E4: '#7c3aed', E4B: '#7c3aed',
  E6: '#db2777', E7: '#dc2626', E8: '#0891b2',
  '33': '#4f46e5', '33B': '#4f46e5', '40': '#ea580c', '21': '#16a34a', '32': '#9333ea', '46': '#0284c7',
  '11': '#0d9488', M11: '#0d9488', '14': '#06b6d4', M14: '#06b6d4', '15': '#6366f1',
  '16': '#8b5cf6', '17': '#14b8a6', '18': '#3b82f6',
};
const fallback = ['#be185d', '#1d4ed8', '#b45309', '#047857', '#7e22ce', '#b91c1c',
  '#0e7490', '#4338ca', '#15803d', '#c2410c', '#0369a1', '#a21caf'];

export function normalizeLine(value: string) {
  return value.trim().toUpperCase();
}

export function busLineColor(value: string) {
  const ref = normalizeLine(value);
  let hash = 0;
  for (const character of ref) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return lineColors[ref] ?? fallback[hash % fallback.length];
}
