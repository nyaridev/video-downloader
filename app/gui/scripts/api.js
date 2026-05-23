export async function apiCall(method, ...args) {
  if (!window.pywebview || !window.pywebview.api) {
    throw new Error("Backend not ready yet.");
  }
  return await window.pywebview.api[method](...args);
}
