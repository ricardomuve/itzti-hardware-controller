/**
 * Tipos de configuración del Dashboard.
 * Requisito: 7.1
 */

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'knob' | 'slider' | 'metric' | 'status';
  position: WidgetPosition;
  config: Record<string, unknown>;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
}
