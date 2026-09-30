import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useLocalTranscription from "@/app/hooks/useLocalTranscription";

// ---------------------------------------------------------------------------
// Mock WebSocket — mô phỏng đúng ngữ nghĩa browser (close event async)
// ---------------------------------------------------------------------------
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  // Browser dispatch close event ASYNC (task queue) -> mô phỏng bằng setTimeout 0
  close(code = 1000, reason = "") {
    if (this.readyState >= MockWebSocket.CLOSING) return;
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => {
      this.onclose?.({ code, reason, wasClean: code === 1000 });
    }, 0);
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateServerClose(code = 1006) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason: "", wasClean: false });
  }
}

// ---------------------------------------------------------------------------
// Mock AudioContext (happy-dom không có Web Audio API)
// ---------------------------------------------------------------------------
class MockAudioContext {
  state = "running";
  sampleRate = 48000;
  destination = {};
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createScriptProcessor() {
    return { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
  }
  close() {
    return Promise.resolve();
  }
  resume() {
    return Promise.resolve();
  }
}

const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
const lastInstance = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

describe("useLocalTranscription — WebSocket reconnect", () => {
  const originalWsDesc = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  const originalAcDesc = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");

  const setGlobal = (name: string, value: unknown) => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  const restoreGlobal = (name: string, desc: PropertyDescriptor | undefined) => {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as Record<string, unknown>)[name];
  };

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    setGlobal("WebSocket", MockWebSocket);
    setGlobal("AudioContext", MockAudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreGlobal("WebSocket", originalWsDesc);
    restoreGlobal("AudioContext", originalAcDesc);
  });

  it("retry đúng 5 lần rồi báo lỗi vĩnh viễn (không kẹt ở 1/5)", async () => {
    const onPermanentError = vi.fn();
    const { result } = renderHook(() => useLocalTranscription(undefined, onPermanentError));

    await act(async () => {
      await result.current.startListening(fakeStream, 0, "vi");
    });
    expect(MockWebSocket.instances.length).toBe(1);

    // Server đóng 6 lần liên tiếp (lần đầu + 5 retry)
    const expected = ["1/5", "2/5", "3/5", "4/5", "5/5"];
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let i = 0; i < 5; i++) {
      act(() => {
        lastInstance().simulateServerClose(1006);
      });
      expect(result.current.connectionError).toContain(expected[i]);
      expect(result.current.isListening).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(delays[i]);
      });
      // Sau mỗi lần retry phải có socket MỚI (đây là bug cũ: kẹt ở 1/5)
      expect(MockWebSocket.instances.length).toBe(i + 2);
    }

    // Lần đóng thứ 6 -> vượt 5 lần thử -> vĩnh viễn
    act(() => {
      lastInstance().simulateServerClose(1006);
    });
    expect(result.current.connectionError).toContain("sau 5 lần thử");
    expect(result.current.connectionError).toContain("1006");
    expect(result.current.isListening).toBe(false);
    expect(onPermanentError).toHaveBeenCalledTimes(1);
    expect(onPermanentError).toHaveBeenCalledWith(1006);
  });

  it("kết nối lại thành công -> xóa banner và reset bộ đếm retry", async () => {
    const { result } = renderHook(() => useLocalTranscription());

    await act(async () => {
      await result.current.startListening(fakeStream, 0, "vi");
    });

    act(() => {
      lastInstance().simulateServerClose(1006);
    });
    expect(result.current.connectionError).toContain("(1/5)");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      lastInstance().simulateOpen();
    });
    expect(result.current.connectionError).toBeNull();

    // Close lần nữa sau khi đã mở lại -> phải quay về (1/5), không phải (2/5)
    act(() => {
      lastInstance().simulateServerClose(1006);
    });
    expect(result.current.connectionError).toContain("(1/5)");
  });

  it("stopListening chủ động -> KHÔNG retry", async () => {
    const { result } = renderHook(() => useLocalTranscription());

    await act(async () => {
      await result.current.startListening(fakeStream, 0, "vi");
    });
    act(() => {
      lastInstance().simulateOpen();
    });

    const instanceCount = MockWebSocket.instances.length;
    act(() => {
      result.current.stopListening();
    });
    // Kéo hết timer (kể cả close event async + heartbeat)
    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    expect(MockWebSocket.instances.length).toBe(instanceCount);
    expect(result.current.connectionError).toBeNull();
    expect(result.current.isListening).toBe(false);
  });

  it("close event đến MUỘN của socket cũ bị bỏ qua (race pause -> resume)", async () => {
    const { result } = renderHook(() => useLocalTranscription());

    await act(async () => {
      await result.current.startListening(fakeStream, 0, "vi");
    });
    act(() => {
      lastInstance().simulateOpen();
    });
    expect(MockWebSocket.instances.length).toBe(1);

    // Pause -> close event của #1 chỉ về SAU (async như browser)
    act(() => {
      result.current.stopListening();
    });
    // Resume ngay trước khi close event kịp fire
    await act(async () => {
      await result.current.startListening(fakeStream, 13, "vi");
    });
    expect(MockWebSocket.instances.length).toBe(2);

    // Close event cũ fire lúc này -> phải bị identity guard nuốt
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.connectionError).toBeNull();
    expect(result.current.isListening).toBe(true);
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("mất mạng rồi có mạng lại (event online) -> kết nối ngay lập tức", async () => {
    const { result } = renderHook(() => useLocalTranscription());

    await act(async () => {
      await result.current.startListening(fakeStream, 0, "vi");
    });

    act(() => {
      lastInstance().simulateServerClose(1006);
    });
    expect(result.current.connectionError).toContain("(1/5)");
    expect(MockWebSocket.instances.length).toBe(1);

    // Có mạng trở lại TRƯỚC khi hết thời gian backoff 1000ms
    await act(async () => {
      window.dispatchEvent(new window.Event("online"));
    });

    expect(MockWebSocket.instances.length).toBe(2);

    // Kết nối mới mở thành công -> heartbeat chạy, không còn retry nào nữa
    act(() => {
      lastInstance().simulateOpen();
    });
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(MockWebSocket.instances.length).toBe(2);
    expect(result.current.connectionError).toBeNull();
  });

  it("unmount -> đóng socket, không retry mồ côi", async () => {
    const { result, unmount } = renderHook(() => useLocalTranscription());

    await act(async () => {
      await result.current.startListening(fakeStream, 0, "vi");
    });
    act(() => {
      lastInstance().simulateOpen();
    });

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    expect(MockWebSocket.instances.length).toBe(1);
    expect(lastInstance().readyState).toBe(MockWebSocket.CLOSED);
  });
});
