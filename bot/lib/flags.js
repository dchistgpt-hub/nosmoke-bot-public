const on = n => (process.env[n] || '0') === '1';
module.exports = {
  FF_DB: on('FF_DB'),
  FF_ONBOARDING: on('FF_ONBOARDING'),
  FF_SOS: on('FF_SOS'),
  FF_PAYMENTS: on('FF_PAYMENTS'),
  FF_CONTENT: on('FF_CONTENT'),
  FF_ADMIN: on('FF_ADMIN'),
};
