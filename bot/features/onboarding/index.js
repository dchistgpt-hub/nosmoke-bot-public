function register(bot, deps = {}) {
  // TODO: implement feature
  // keep it silent when enabled without config
  bot.command('onboarding', ctx => ctx.reply('Feature "onboarding" is not enabled/configured yet'));
}
module.exports = { register };
