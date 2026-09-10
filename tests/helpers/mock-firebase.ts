import { vi } from "vitest";

const updateDocMock = vi.fn(async () => {});
const setDocMock = vi.fn(async () => {});
const getDocMock = vi.fn(async () => ({ exists: () => false, data: () => undefined }));
const getDocsMock = vi.fn(async () => ({ docs: [], size: 0 }));
const deleteDocMock = vi.fn(async () => {});
const onSnapshotMock = vi.fn((_q, onData, _onError) => {
  setTimeout(() => onData({ docs: [] }), 0);
  return () => {};
});

export const mockFirestore = {
  updateDoc: updateDocMock,
  setDoc: setDocMock,
  getDoc: getDocMock,
  getDocs: getDocsMock,
  deleteDoc: deleteDocMock,
  onSnapshot: onSnapshotMock,
};

export const resetFirestoreMocks = () => {
  updateDocMock.mockReset();
  setDocMock.mockReset();
  getDocMock.mockReset();
  getDocsMock.mockReset();
  deleteDocMock.mockReset();
  onSnapshotMock.mockReset();
  onSnapshotMock.mockImplementation((_q, onData) => {
    setTimeout(() => onData({ docs: [] }), 0);
    return () => {};
  });
};

vi.mock("../../app/lib/firebase", () => ({
  db: {},
  auth: {},
}));

export const updateDocCalls = () => updateDocMock.mock.calls;
export const lastUpdateCall = () => updateDocMock.mock.calls[updateDocMock.mock.calls.length - 1];
