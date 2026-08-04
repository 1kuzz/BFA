var DEFAULT_SCOPE = {
  allowSubdomains: true,
  domains: ['bitrix24.eu', 'kasperskyform.eu'],
  matchUrls: ['https://*.bitrix24.eu/*', 'https://kasperskyform.eu/*', 'https://*.kasperskyform.eu/*'],
  expectedUrl: 'https://kasperskyform.eu/crm/webform/'
};

var RU_SCOPE = {
  allowSubdomains: false,
  domains: ['kasperskyform.com'],
  matchUrls: ['https://kasperskyform.com/crm/webform/*'],
  requiredPath: '/crm/webform/',
  expectedUrl: 'https://kasperskyform.com/crm/webform/'
};

export function crmScope(profileName) {
  return String(profileName || '').toUpperCase() === 'RU' ? RU_SCOPE : DEFAULT_SCOPE;
}

export function acceptsCrmHost(profileName, host) {
  var scope = crmScope(profileName);
  return scope.domains.some(function (domain) {
    return host === domain || (scope.allowSubdomains && host.endsWith('.' + domain));
  });
}

export function acceptsCrmUrl(profileName, value) {
  var url;
  try { url = new URL(value); } catch (e) { return false; }
  if (url.protocol !== 'https:' || !acceptsCrmHost(profileName, url.host)) return false;
  var requiredPath = crmScope(profileName).requiredPath;
  return !requiredPath || url.pathname.startsWith(requiredPath);
}
