// Runtime parameters read once at boot. Supabase sessions live in the client's
// own storage, so only the legacy access-token query param is honoured here.
const isNode = typeof window === 'undefined';

const isClearAccessTokenRequested = () =>
  !isNode && new URLSearchParams(window.location.search).get('clear_access_token') === 'true';

const clearStoredAccessToken = () => {
  window.localStorage.removeItem('token');
};

const getAppParams = () => {
  if (isClearAccessTokenRequested()) {
    clearStoredAccessToken();
  }
  return {
    appId: 'bountybox',
    token: null,
    appBaseUrl: isNode ? undefined : window.location.origin,
  };
};

export const appParams = {
  ...getAppParams(),
};
