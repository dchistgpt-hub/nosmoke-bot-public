function register(bot, deps = {}) {
  // TODO: implement feature
  // keep it silent when enabled without config
  bot.command('sos', ctx => ctx.reply('Feature "sos" is not enabled/configured yet'));
}
module.exports = { register };
