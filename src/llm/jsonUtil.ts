/** Strips a ```json fenced code block if the model wrapped its output in one. */
function stripCodeFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

/** Best-effort JSON parse of an LLM response; returns undefined if it isn't valid JSON. */
export function tryParseJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch {
    return undefined;
  }
}
