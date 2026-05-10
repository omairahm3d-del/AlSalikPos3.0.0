const Ping = {
  start: (_host, _options) =>
    Promise.reject(new Error("react-native-ping is not available on this platform")),
};

module.exports = Ping;
module.exports.default = Ping;
