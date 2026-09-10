// app/api/training-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import type { TrainingDataSample } from "../../lib/trainingData";

const TRAINING_COLLECTION = "training_data";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const samples: TrainingDataSample[] = body.samples;

    if (!Array.isArray(samples) || samples.length === 0) {
      return NextResponse.json({ error: "No samples provided" }, { status: 400 });
    }

    const colRef = collection(db, TRAINING_COLLECTION);

    // Batch write — mỗi sample là 1 document
    await Promise.all(
      samples.map((sample) => {
        const docRef = doc(colRef, sample.id);
        return setDoc(docRef, sample);
      })
    );

    return NextResponse.json({ saved: samples.length });
  } catch (e) {
    console.error("[POST /api/training-data]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
