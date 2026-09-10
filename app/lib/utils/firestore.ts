import { deleteField } from "firebase/firestore";

export const deleteFieldValue = <T = unknown>(): T => deleteField() as unknown as T;
