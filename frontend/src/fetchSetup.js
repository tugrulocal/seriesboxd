// Global fetch interceptor to handle network timeouts and seamless Wi-Fi / Mobile Data switches
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;

  window.fetch = async function (resource, options = {}) {
    // If a custom AbortSignal is already provided by caller, respect it
    if (options.signal) {
      return originalFetch(resource, options);
    }

    // Determine timeout: long-running tasks get 20s, standard API calls get 8s
    const resourceUrl = typeof resource === 'string' ? resource : (resource?.url || '');
    const isLongRequest = resourceUrl.includes('/stream') || resourceUrl.includes('/subtitles') || resourceUrl.includes('/admin');
    const defaultTimeout = isLongRequest ? 20000 : 8000;
    const timeoutMs = options.timeout || defaultTimeout;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Fetch timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const response = await originalFetch(resource, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      // Handle network change / stalled TCP connection (Wi-Fi <-> Cellular transition)
      const isGetMethod = !options.method || options.method.toUpperCase() === 'GET';
      const isAbortOrNetworkError = error.name === 'AbortError' || (error.message && error.message.includes('Failed to fetch'));

      if (isGetMethod && isAbortOrNetworkError && !options._isRetry) {
        console.warn(`[Fetch] Network switch or timeout detected for ${resourceUrl}. Auto-retrying on new network...`);
        const retryOptions = { ...options, _isRetry: true };
        return window.fetch(resource, retryOptions);
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
