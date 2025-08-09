function register(bot, deps = {}) {
  // TODO: implement feature
  // keep it silent when enabled without config
  bot.command('admin', ctx => ctx.reply('Feature "admin" is not enabled/configured yet'));
}
module.exports = { register };
