/**
 * PresetEditor — Formulario CRUD para el Rol_Experto.
 * Requisitos: 4.4, 4.6, 6.1, 6.2, 6.3, 6.4
 */

import { useState, useCallback } from 'react';
import { usePresetStore } from '../store/preset-store';
import type { SessionPreset, PresetChannel, PresetActuator } from '../store/preset-types';
import { validatePreset } from '../utils/preset-serializer';
import type { SignalUnit } from '../store/signal-store';

type EditorMode = 'list' | 'create' | 'edit';
const SIGNAL_UNITS: SignalUnit[] = ['°C', 'V', 'A', 'Pa', 'dB'];

const inputCls = 'bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30';
const btnCls = 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors';

function emptyChannel(): PresetChannel { return { channelId: '', name: '', unit: '°C', sampleRateHz: 1 }; }
function emptyActuator(): PresetActuator { return { deviceId: '', paramName: '', value: 0 }; }

export default function PresetEditor() {
  const presets = usePresetStore((s) => s.presets);
  const createPreset = usePresetStore((s) => s.createPreset);
  const updatePreset = usePresetStore((s) => s.updatePreset);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const storeError = usePresetStore((s) => s.error);

  const [mode, setMode] = useState<EditorMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<PresetChannel[]>([emptyChannel()]);
  const [actuators, setActuators] = useState<PresetActuator[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const resetForm = useCallback(() => { setName(''); setChannels([emptyChannel()]); setActuators([]); setValidationErrors([]); setEditingId(null); }, []);
  const openCreate = useCallback(() => { resetForm(); setMode('create'); }, [resetForm]);
  const openEdit = useCallback((preset: SessionPreset) => {
    setName(preset.name); setChannels(preset.channels.length > 0 ? preset.channels.map((c) => ({ ...c })) : [emptyChannel()]);
    setActuators(preset.actuators.map((a) => ({ ...a }))); setEditingId(preset.id); setValidationErrors([]); setMode('edit');
  }, []);
  const handleCancel = useCallback(() => { resetForm(); setMode('list'); }, [resetForm]);
  const handleDelete = useCallback(async (id: string, presetName: string) => {
    if (!window.confirm(`¿Eliminar el preset "${presetName}"?`)) return;
    await deletePreset(id);
  }, [deletePreset]);

  const updateChannel = useCallback((i: number, field: keyof PresetChannel, value: string | number) => {
    setChannels((prev) => prev.map((ch, idx) => (idx === i ? { ...ch, [field]: value } : ch)));
  }, []);
  const addChannel = useCallback(() => setChannels((prev) => [...prev, emptyChannel()]), []);
  const removeChannel = useCallback((i: number) => setChannels((prev) => prev.filter((_, idx) => idx !== i)), []);
  const updateActuator = useCallback((i: number, field: keyof PresetActuator, value: string | number) => {
    setActuators((prev) => prev.map((act, idx) => (idx === i ? { ...act, [field]: value } : act)));
  }, []);
  const addActuator = useCallback(() => setActuators((prev) => [...prev, emptyActuator()]), []);
  const removeActuator = useCallback((i: number) => setActuators((prev) => prev.filter((_, idx) => idx !== i)), []);

  const handleSave = useCallback(async () => {
    const data = { name: name.trim(), channels, actuators };
    const v = validatePreset(data);
    if (!v.valid) { setValidationErrors(v.errors); return; }
    setValidationErrors([]);
    const ok = mode === 'create' ? await createPreset(data) : await updatePreset(editingId!, data);
    if (ok) { resetForm(); setMode('list'); }
  }, [name, channels, actuators, mode, editingId, createPreset, updatePreset, resetForm]);

  if (mode === 'list') {
    return (
      <div data-testid="preset-editor">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Editor de Presets</h2>
          <button data-testid="create-preset-btn" onClick={openCreate} className={`${btnCls} bg-accent/15 text-accent hover:bg-accent/25`}>+ Nuevo Preset</button>
        </div>
        {presets.length === 0 && <p data-testid="no-presets-message" className="text-text-muted text-sm">No hay presets configurados.</p>}
        <ul data-testid="preset-editor-list" className="space-y-2">
          {presets.map((preset) => (
            <li key={preset.id} data-testid={`preset-editor-item-${preset.id}`} className="flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:border-border-light transition-colors">
              <span data-testid={`preset-editor-name-${preset.id}`} className="text-sm text-text-primary">{preset.name}</span>
              <span className="flex gap-2">
                <button data-testid={`edit-preset-btn-${preset.id}`} onClick={() => openEdit(preset)} className={`${btnCls} text-accent hover:bg-accent/10`}>Editar</button>
                <button data-testid={`delete-preset-btn-${preset.id}`} onClick={() => handleDelete(preset.id, preset.name)} className={`${btnCls} text-danger hover:bg-danger/10`}>Eliminar</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div data-testid="preset-editor" className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">{mode === 'create' ? 'Nuevo Preset' : 'Editar Preset'}</h2>

      {validationErrors.length > 0 && (
        <div data-testid="validation-errors" className="bg-danger/10 border border-danger/20 rounded-lg p-3 space-y-1">
          {validationErrors.map((err, i) => <p key={i} className="text-danger text-xs">{err}</p>)}
        </div>
      )}
      {storeError && <div data-testid="store-error" className="bg-danger/10 border border-danger/20 rounded-lg p-3"><p className="text-danger text-xs">{storeError}</p></div>}

      <div>
        <label htmlFor="preset-name" className="block text-xs text-text-muted mb-1">Nombre</label>
        <input id="preset-name" data-testid="preset-name-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del preset" className={`${inputCls} w-full`} />
      </div>

      <fieldset data-testid="channels-section" className="border border-border rounded-lg p-4 space-y-3">
        <legend className="text-xs font-medium text-text-muted px-1">Canales</legend>
        {channels.map((ch, idx) => (
          <div key={idx} data-testid={`channel-row-${idx}`} className="flex flex-wrap gap-2 items-end bg-surface rounded-md p-2 border border-border/50">
            <div><label className="block text-xs text-text-muted mb-0.5">ID</label><input data-testid={`channel-id-${idx}`} type="text" value={ch.channelId} onChange={(e) => updateChannel(idx, 'channelId', e.target.value)} placeholder="ID" aria-label={`Channel ${idx} ID`} className={`${inputCls} w-20`} /></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Nombre</label><input data-testid={`channel-name-${idx}`} type="text" value={ch.name} onChange={(e) => updateChannel(idx, 'name', e.target.value)} placeholder="Nombre" aria-label={`Channel ${idx} name`} className={`${inputCls} w-28`} /></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Unidad</label><select data-testid={`channel-unit-${idx}`} value={ch.unit} onChange={(e) => updateChannel(idx, 'unit', e.target.value)} aria-label={`Channel ${idx} unit`} className={inputCls}>{SIGNAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Hz</label><input data-testid={`channel-samplerate-${idx}`} type="number" value={ch.sampleRateHz} onChange={(e) => updateChannel(idx, 'sampleRateHz', Number(e.target.value))} min={1} aria-label={`Channel ${idx} sample rate`} className={`${inputCls} w-16`} /></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Mín</label><input data-testid={`channel-thresholdmin-${idx}`} type="number" value={ch.thresholdMin ?? ''} onChange={(e) => updateChannel(idx, 'thresholdMin', e.target.value === '' ? undefined as any : Number(e.target.value))} placeholder="—" aria-label={`Channel ${idx} threshold min`} className={`${inputCls} w-16`} /></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Máx</label><input data-testid={`channel-thresholdmax-${idx}`} type="number" value={ch.thresholdMax ?? ''} onChange={(e) => updateChannel(idx, 'thresholdMax', e.target.value === '' ? undefined as any : Number(e.target.value))} placeholder="—" aria-label={`Channel ${idx} threshold max`} className={`${inputCls} w-16`} /></div>
            {channels.length > 1 && <button data-testid={`remove-channel-btn-${idx}`} onClick={() => removeChannel(idx)} className="text-danger/60 hover:text-danger text-sm px-1">✕</button>}
          </div>
        ))}
        <button data-testid="add-channel-btn" onClick={addChannel} className={`${btnCls} text-accent hover:bg-accent/10`}>+ Canal</button>
      </fieldset>

      <fieldset data-testid="actuators-section" className="border border-border rounded-lg p-4 space-y-3">
        <legend className="text-xs font-medium text-text-muted px-1">Actuadores</legend>
        {actuators.map((act, idx) => (
          <div key={idx} data-testid={`actuator-row-${idx}`} className="flex flex-wrap gap-2 items-end bg-surface rounded-md p-2 border border-border/50">
            <div><label className="block text-xs text-text-muted mb-0.5">Dispositivo</label><input data-testid={`actuator-deviceid-${idx}`} type="text" value={act.deviceId} onChange={(e) => updateActuator(idx, 'deviceId', e.target.value)} placeholder="ID" aria-label={`Actuator ${idx} device ID`} className={`${inputCls} w-24`} /></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Parámetro</label><input data-testid={`actuator-paramname-${idx}`} type="text" value={act.paramName} onChange={(e) => updateActuator(idx, 'paramName', e.target.value)} placeholder="Param" aria-label={`Actuator ${idx} param name`} className={`${inputCls} w-24`} /></div>
            <div><label className="block text-xs text-text-muted mb-0.5">Valor</label><input data-testid={`actuator-value-${idx}`} type="number" value={act.value} onChange={(e) => updateActuator(idx, 'value', Number(e.target.value))} aria-label={`Actuator ${idx} value`} className={`${inputCls} w-20`} /></div>
            <button data-testid={`remove-actuator-btn-${idx}`} onClick={() => removeActuator(idx)} className="text-danger/60 hover:text-danger text-sm px-1">✕</button>
          </div>
        ))}
        <button data-testid="add-actuator-btn" onClick={addActuator} className={`${btnCls} text-accent hover:bg-accent/10`}>+ Actuador</button>
      </fieldset>

      <div data-testid="form-actions" className="flex gap-3">
        <button data-testid="save-preset-btn" onClick={handleSave} className={`${btnCls} bg-accent text-surface hover:bg-accent-hover`}>{mode === 'create' ? 'Crear Preset' : 'Guardar Cambios'}</button>
        <button data-testid="cancel-btn" onClick={handleCancel} className={`${btnCls} text-text-secondary hover:bg-surface-hover`}>Cancelar</button>
      </div>
    </div>
  );
}
