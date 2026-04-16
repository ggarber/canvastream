// This worker just sends a message every X ms. 
// Workers are less throttled in the background than the main thread.
let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e) => {
  if (e.data.type === 'start') {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      self.postMessage({ type: 'tick' });
    }, e.data.interval || 33);
  } else if (e.data.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
  }
};
