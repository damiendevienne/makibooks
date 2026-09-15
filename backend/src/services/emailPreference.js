// Strapi's database adapters may return booleans as false, 0, or string values.
// Missing values are treated as enabled for existing accounts.
function emailNotificationsEnabled(value) {
  return !(value === false || value === 0 || value === 'false' || value === '0');
}

module.exports = { emailNotificationsEnabled };
