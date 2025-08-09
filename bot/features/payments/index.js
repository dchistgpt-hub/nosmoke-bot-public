function register(bot, deps = {}) {
  // TODO: implement feature
  // keep it silent when enabled without config
  bot.command('payments', ctx => ctx.reply('Feature "payments" is not enabled/configured yet'));
}
module.exports = { register };
