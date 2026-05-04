const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

// Block Metro from watching temp dirs created by barcode-detector during install
const barcodeDetectorTmpPattern = /barcode-detector[^/]*_tmp_\d+/;
config.watchFolders = (config.watchFolders ?? []).filter(
  (folder) => !barcodeDetectorTmpPattern.test(folder)
);
const defaultBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];
config.resolver.blockList = [
  ...defaultBlockList,
  new RegExp(barcodeDetectorTmpPattern.source),
];

module.exports = config;
