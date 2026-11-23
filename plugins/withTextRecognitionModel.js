// Asks Google Play services to fetch the on-device text recognition model
// as soon as it can, rather than on the first ticket screenshot.
//
// (Shipping ML Kit's bundled model instead doesn't build on EAS: its
// artifact isn't served by the build mirror. readTicket() retries while
// the model is still downloading.)
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withTextRecognitionModel(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return cfg;
  });
};
