import { getAdminDb } from './firebase-admin';
import type { SummaryStage } from './summary-progress';

/** Ignore late callbacks from a previous report, and never touch another owner's meeting. */
export async function updateSummaryStage(meetingId: string, uid: string, operationId: string, stage: SummaryStage) {
  const ref = getAdminDb().collection('meetings').doc(meetingId);
  await getAdminDb().runTransaction(async tx => {
    const meeting = (await tx.get(ref)).data();
    if (meeting?.userId !== uid || meeting.summaryProgress?.operationId !== operationId) return;
    tx.update(ref, { summaryProgress: { ...meeting.summaryProgress, stage, updatedAt: Date.now() } });
  });
}
