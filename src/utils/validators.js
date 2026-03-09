function parseAppId(rawValue) {
  const appId = Number(rawValue);
  if (!Number.isInteger(appId) || appId <= 0 || appId > 2147483647) {
    const error = new Error("Invalid AppID. Use a positive integer.");
    error.code = "INVALID_APPID";
    throw error;
  }
  return appId;
}

function isValidAppId(rawValue) {
  try {
    parseAppId(rawValue);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  parseAppId,
  isValidAppId
};
