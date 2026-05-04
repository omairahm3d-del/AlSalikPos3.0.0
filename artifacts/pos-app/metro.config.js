const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

const tmpDirPattern = /[^/]+_tmp_\d+/;
config.watchFolders = (config.watchFolders ?? []).filter(
  (folder) => !tmpDirPattern.test(folder)
);
const defaultBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];
config.resolver.blockList = [
  ...defaultBlockList,
  tmpDirPattern,
];

module.exports = config;
