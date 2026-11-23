// Asks Google Play to download the on-device text recognition model when
// StashCall is installed, so the first ticket screenshot is read straight
// away instead of failing while the model downloads.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withTextRecognitionModel(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return cfg;
  });
};
