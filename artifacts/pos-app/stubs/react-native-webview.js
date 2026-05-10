const React = require("react");
const { View } = require("react-native");

function WebView(props) {
  return React.createElement(View, { style: props.style });
}
WebView.displayName = "WebView";

module.exports = { WebView };
module.exports.default = { WebView };
