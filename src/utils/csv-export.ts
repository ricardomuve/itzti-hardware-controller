/**
 * Exportación de datos de señales analógicas a formato CSV.
 * Requisito: 7.5
 */

export interface CSVChannel {
  name: string;
  unit: string;
  samples: { timestamp: number; value: number }[];
}

/**
 * Genera un string CSV a partir de canales de señal.
 * Header con nombres de canales y unidades, filas con timestamps y valores.
 */
export function exportToCSV(channels: CSVChannel[]): string {
  const header = 'timestamp,' + channels.map(c => `${c.name} (${c.unit})`).join(',');
  const allTimestamps = [...new Set(channels.flatMap(c => c.samples.map(s => s.timestamp)))].sort((a, b) => a - b);
  const rows = allTimestamps.map(ts => {
    const values = channels.map(c => {
      const sample = c.samples.find(s => s.timestamp === ts);
      return sample ? sample.value.toString() : '';
    });
    return `${ts},${values.join(',')}`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Descarga un string CSV como archivo usando la Blob API.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
