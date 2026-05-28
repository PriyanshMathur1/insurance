import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent } from '@/lib/analytics';

describe('trackEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does nothing if window is undefined', () => {
    expect(() => trackEvent('test_event')).not.toThrow();
  });

  it('pushes to dataLayer and localStorage when window is defined', () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };
    const mockWindow = {
      dataLayer: undefined as any,
      localStorage: mockLocalStorage
    };

    vi.stubGlobal('window', mockWindow);

    trackEvent('test_event', { key: 'value' });

    expect(mockWindow.dataLayer).toEqual([
      { event: 'test_event', key: 'value', at: '2024-01-01T00:00:00.000Z' }
    ]);
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('insurance_analytics_events');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'insurance_analytics_events',
      JSON.stringify([{ event: 'test_event', key: 'value', at: '2024-01-01T00:00:00.000Z' }])
    );
  });

  it('appends to existing dataLayer and localStorage', () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify([{ event: 'old_event', at: '2023-01-01T00:00:00.000Z' }])),
      setItem: vi.fn()
    };
    const mockWindow = {
      dataLayer: [{ event: 'old_event', at: '2023-01-01T00:00:00.000Z' }],
      localStorage: mockLocalStorage
    };

    vi.stubGlobal('window', mockWindow);

    trackEvent('new_event');

    expect(mockWindow.dataLayer).toHaveLength(2);
    expect(mockWindow.dataLayer![1]).toEqual({ event: 'new_event', at: '2024-01-01T00:00:00.000Z' });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'insurance_analytics_events',
      JSON.stringify([
        { event: 'old_event', at: '2023-01-01T00:00:00.000Z' },
        { event: 'new_event', at: '2024-01-01T00:00:00.000Z' }
      ])
    );
  });

  it('keeps only the last 50 events in localStorage', () => {
    const existingEvents = Array.from({ length: 50 }, (_, i) => ({ event: `event_${i}`, at: '2023-01-01T00:00:00.000Z' }));
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(existingEvents)),
      setItem: vi.fn()
    };
    const mockWindow = {
      dataLayer: [],
      localStorage: mockLocalStorage
    };

    vi.stubGlobal('window', mockWindow);

    trackEvent('new_event');

    const setItemCallArgs = mockLocalStorage.setItem.mock.calls[0][1];
    const parsedStored = JSON.parse(setItemCallArgs);

    expect(parsedStored).toHaveLength(50);
    expect(parsedStored[49].event).toBe('new_event');
    expect(parsedStored[0].event).toBe('event_1'); // event_0 should be dropped
  });

  it('does not throw if localStorage operations fail', () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockImplementation(() => { throw new Error('Storage disabled'); }),
      setItem: vi.fn()
    };
    const mockWindow = {
      dataLayer: [],
      localStorage: mockLocalStorage
    };

    vi.stubGlobal('window', mockWindow);

    expect(() => trackEvent('test_event')).not.toThrow();

    // Should still push to dataLayer
    expect(mockWindow.dataLayer).toHaveLength(1);
  });
});
