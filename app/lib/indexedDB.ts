import { Meeting } from "./db";

const DB_NAME = "meeting-app-db";
const DB_VERSION = 2; // Version 2 supports both meta and audio stores
const META_STORE = "draft_meta";
const AUDIO_STORE = "draft_audio";

export interface DraftMeta extends Omit<Meeting, "status"> {
    status: "draft";
    lastModified: number;
}

interface AudioChunkData {
    draftId: string;
    chunk: Blob;
    timestamp: number;
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
                // Use autoIncrement ID for chunks, index by draftId
                const audioStore = db.createObjectStore(AUDIO_STORE, { autoIncrement: true });
                audioStore.createIndex("draftId", "draftId", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const saveDraftMeta = async (meeting: Partial<Meeting>): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readwrite");
        const store = tx.objectStore(META_STORE);

        // Ensure status is 'draft' and add lastModified
        const draftData = {
            ...meeting,
            status: "draft",
            lastModified: Date.now(),
        };

        const request = store.put(draftData);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const appendAudioChunks = async (draftId: string, chunks: Blob[]): Promise<void> => {
    if (chunks.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, "readwrite");
        const store = tx.objectStore(AUDIO_STORE);

        let completed = 0;
        const checkComplete = () => {
            completed++;
            if (completed === chunks.length) resolve();
        };

        chunks.forEach((chunk) => {
            const data: AudioChunkData = {
                draftId,
                chunk,
                timestamp: Date.now(),
            };
            const request = store.add(data);
            request.onsuccess = checkComplete;
            request.onerror = () => reject(request.error);
        });
    });
};

export const getAllDraftsMeta = async (userId: string): Promise<Meeting[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readonly");
        const store = tx.objectStore(META_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const allDrafts = request.result as DraftMeta[];
            const userDrafts = allDrafts.filter(d => d.userId === userId);
            resolve(userDrafts as unknown as Meeting[]);
        };
        request.onerror = () => reject(request.error);
    });
};

export const getDraftFull = async (draftId: string): Promise<{ meta: Meeting, audioBlob: Blob } | null> => {
    const db = await openDB();

    // 1. Get Meta
    const metaPromise = new Promise<DraftMeta>((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readonly");
        const store = tx.objectStore(META_STORE);
        const req = store.get(draftId);
        req.onsuccess = (e) => resolve((e.target as IDBRequest).result);
        req.onerror = (e) => reject((e.target as IDBRequest).error);
    });

    // 2. Get Audio Chunks
    const audioPromise = new Promise<Blob[]>((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, "readonly");
        const store = tx.objectStore(AUDIO_STORE);
        const index = store.index("draftId");
        const request = index.getAll(draftId);

        request.onsuccess = () => {
            const results = request.result as AudioChunkData[];
            const chunks = results.map(r => r.chunk);
            resolve(chunks);
        };
        request.onerror = () => reject(request.error);
    });

    try {
        const [meta, chunks] = await Promise.all([metaPromise, audioPromise]);
        if (!meta) return null;

        // Use webm for MediaRecorder compatibility
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        return { meta: meta as unknown as Meeting, audioBlob };

    } catch (e) {
        console.error("Error retrieving full draft", e);
        return null;
    }
};

export const deleteDraft = async (draftId: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([META_STORE, AUDIO_STORE], "readwrite");

        // 1. Delete Meta
        tx.objectStore(META_STORE).delete(draftId);

        // 2. Delete Audio Chunks
        const audioStore = tx.objectStore(AUDIO_STORE);
        const index = audioStore.index("draftId");
        const request = index.openKeyCursor(IDBKeyRange.only(draftId));

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
                audioStore.delete(cursor.primaryKey);
                cursor.continue();
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
