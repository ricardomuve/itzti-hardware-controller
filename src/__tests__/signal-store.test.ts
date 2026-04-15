import { describe, it, expect, beforeEach } from 'vitest';
import {
  useSignalStore,
  MAX_SAMPLES_PER_CHANNEL,
  type SignalChannel,
  type SignalSample,
} from '../store/signal-store';

function makeChannel(overrides: Partial<SignalChannel> = {}): SignalChannel {
  return {
    id: 'ch-1',
    name: 'Temperature Sensor',
    unit: '°C',
    sampleRateHz: 100,
    samples: [],
    ...overrides,
  };
}

function makeSample(overrides: Partial<SignalSample> = {}): SignalSample {
  return { timestamp: Date.now(), value: 23.5, ...overrides };
}

describe('signal-store', () => {
  beforeEach(() => {
    useSignalStore.setState({ channels: [] });
  });

  // --- addChannel ---

  it('adds a channel to an empty store', () => {
    const ch = makeChannel();
    useSignalStore.getState().addChannel(ch);

    const { channels } = useSignalStore.getState();
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual(ch);
  });

  it('does not add a duplicate channel with the same id', () => {
    const ch = makeChannel();
    useSignalStore.getState().addChannel(ch);
    useSignalStore.getState().addChannel({ ...ch, name: 'Duplicate' });

    const { channels } = useSignalStore.getState();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('Temperature Sensor');
  });

  it('adds multiple channels with different ids', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'a' }));
    useSignalStore.getState().addChannel(makeChannel({ id: 'b' }));

    expect(useSignalStore.getState().channels).toHaveLength(2);
  });

  // --- removeChannel ---

  it('removes a channel by id', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'a' }));
    useSignalStore.getState().addChannel(makeChannel({ id: 'b' }));
    useSignalStore.getState().removeChannel('a');

    const { channels } = useSignalStore.getState();
    expect(channels).toHaveLength(1);
    expect(channels[0].id).toBe('b');
  });

  it('does nothing when removing a non-existent channel', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'a' }));
    useSignalStore.getState().removeChannel('non-existent');

    expect(useSignalStore.getState().channels).toHaveLength(1);
  });

  // --- pushSample ---

  it('pushes a sample to a channel', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'ch-1' }));
    const sample = makeSample({ timestamp: 1000, value: 25.0 });
    useSignalStore.getState().pushSample('ch-1', sample);

    const ch = useSignalStore.getState().channels[0];
    expect(ch.samples).toHaveLength(1);
    expect(ch.samples[0]).toEqual(sample);
  });

  it('appends samples in order', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'ch-1' }));
    useSignalStore.getState().pushSample('ch-1', makeSample({ timestamp: 1, value: 10 }));
    useSignalStore.getState().pushSample('ch-1', makeSample({ timestamp: 2, value: 20 }));

    const ch = useSignalStore.getState().channels[0];
    expect(ch.samples).toHaveLength(2);
    expect(ch.samples[0].value).toBe(10);
    expect(ch.samples[1].value).toBe(20);
  });

  it('implements circular buffer — drops oldest when exceeding limit', () => {
    const initialSamples: SignalSample[] = Array.from(
      { length: MAX_SAMPLES_PER_CHANNEL },
      (_, i) => ({ timestamp: i, value: i })
    );
    useSignalStore.getState().addChannel(
      makeChannel({ id: 'ch-1', samples: initialSamples })
    );

    // Push one more sample beyond the limit
    const newSample = makeSample({ timestamp: MAX_SAMPLES_PER_CHANNEL, value: 999 });
    useSignalStore.getState().pushSample('ch-1', newSample);

    const ch = useSignalStore.getState().channels[0];
    expect(ch.samples).toHaveLength(MAX_SAMPLES_PER_CHANNEL);
    // Oldest sample (timestamp 0) should be dropped
    expect(ch.samples[0].timestamp).toBe(1);
    // Newest sample should be at the end
    expect(ch.samples[ch.samples.length - 1]).toEqual(newSample);
  });

  it('does not affect other channels when pushing a sample', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'a' }));
    useSignalStore.getState().addChannel(makeChannel({ id: 'b' }));
    useSignalStore.getState().pushSample('a', makeSample({ value: 42 }));

    const channels = useSignalStore.getState().channels;
    expect(channels.find((c) => c.id === 'a')!.samples).toHaveLength(1);
    expect(channels.find((c) => c.id === 'b')!.samples).toHaveLength(0);
  });

  // --- setThresholds ---

  it('sets threshold values on a channel', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'ch-1' }));
    useSignalStore.getState().setThresholds('ch-1', 10, 50);

    const ch = useSignalStore.getState().channels[0];
    expect(ch.thresholdMin).toBe(10);
    expect(ch.thresholdMax).toBe(50);
  });

  it('clears thresholds when called with undefined', () => {
    useSignalStore.getState().addChannel(
      makeChannel({ id: 'ch-1', thresholdMin: 5, thresholdMax: 95 })
    );
    useSignalStore.getState().setThresholds('ch-1', undefined, undefined);

    const ch = useSignalStore.getState().channels[0];
    expect(ch.thresholdMin).toBeUndefined();
    expect(ch.thresholdMax).toBeUndefined();
  });

  it('does not affect other channels when setting thresholds', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'a' }));
    useSignalStore.getState().addChannel(makeChannel({ id: 'b' }));
    useSignalStore.getState().setThresholds('a', 0, 100);

    const chB = useSignalStore.getState().channels.find((c) => c.id === 'b')!;
    expect(chB.thresholdMin).toBeUndefined();
    expect(chB.thresholdMax).toBeUndefined();
  });

  // --- setSampleRate ---

  it('sets sample rate on a channel', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'ch-1', sampleRateHz: 100 }));
    useSignalStore.getState().setSampleRate('ch-1', 5000);

    const ch = useSignalStore.getState().channels[0];
    expect(ch.sampleRateHz).toBe(5000);
  });

  it('does not affect other channels when setting sample rate', () => {
    useSignalStore.getState().addChannel(makeChannel({ id: 'a', sampleRateHz: 100 }));
    useSignalStore.getState().addChannel(makeChannel({ id: 'b', sampleRateHz: 200 }));
    useSignalStore.getState().setSampleRate('a', 9999);

    const chB = useSignalStore.getState().channels.find((c) => c.id === 'b')!;
    expect(chB.sampleRateHz).toBe(200);
  });
});
