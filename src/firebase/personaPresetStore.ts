import { db } from './admin';
import { FillerPhrase } from '../persona/fillerPhrases';

export interface PersonaPreset {
  personaOverride: string;
  guardrails?: string;
  fillerPhrases?: FillerPhrase[];
  savedAt: number;
}

function personaPresetDoc(presetId: string) {
  return db.collection('personaPresets').doc(presetId);
}

export async function savePersonaPreset(presetId: string, preset: PersonaPreset): Promise<void> {
  await personaPresetDoc(presetId).set(preset);
}

export async function getPersonaPreset(presetId: string): Promise<PersonaPreset | undefined> {
  const snapshot = await personaPresetDoc(presetId).get();
  return snapshot.exists ? (snapshot.data() as PersonaPreset) : undefined;
}

export async function listPersonaPresets(): Promise<{ id: string; preset: PersonaPreset }[]> {
  const snapshot = await db.collection('personaPresets').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, preset: doc.data() as PersonaPreset }));
}
