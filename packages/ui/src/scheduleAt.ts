// Browser timers overflow beyond about 25 days; a calendar month can be longer.
const MAX_TIMEOUT_MS = 2_147_483_647;

export function scheduleAt(timestamp: number, callback: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  function schedule() {
    const remaining = timestamp - Date.now();
    timer = setTimeout(
      () => {
        if (Date.now() < timestamp) schedule();
        else callback();
      },
      Math.min(MAX_TIMEOUT_MS, Math.max(0, remaining)),
    );
  }
  schedule();
  return () => clearTimeout(timer);
}
